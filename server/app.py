"""FastAPI app: the 14 real endpoints of #24, the quiet stubs, ``/health``, ``/events``
and the built frontend.

Every API route is served under ``/api/v1`` (what the frontend calls) and at
the bare path (what the prototype also accepted). A browser navigation (GET
with ``Accept: text/html``) to a non-``/api/`` path is answered with the SPA's
``index.html`` instead, so a reload of a client-side route never lands on JSON.
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from server.config import MapConfig, setup
from server.events import Broker
from server.gitwriter import DEFAULT_DEBOUNCE_MS, Banner, GitWriter, has_origin
from server.watcher import DEFAULT_WATCH_MS, Watcher
from server.models import (Count, Dependency, Health, Me, Membership, Project, Task,
                           TaskDetail, User)

log = logging.getLogger("jugglebot_map")

BUILD_HINT = "Frontend not built: run `npm run build` in frontend/ (then restart the server)."
DEFAULT_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "frontend", "dist")


def _token(request: Request, body: Optional[Dict[str, Any]] = None) -> Any:
    q = request.query_params.get("if_unchanged_since")
    if q:
        return q
    return (body or {}).get("if_unchanged_since")


async def _json_body(request: Request) -> Dict[str, Any]:
    raw = await request.body()
    if not raw:
        return {}
    try:
        import json
        data = json.loads(raw)
    except ValueError:
        from server.store import ApiError
        raise ApiError(422, {"detail": "request body is not JSON"})
    return data if isinstance(data, dict) else {}


def create_app(repo: Union[str, MapConfig, None] = None, dist_dir: Optional[str] = None,
               git: Optional[bool] = None, debounce_ms: int = DEFAULT_DEBOUNCE_MS,
               watch_ms: int = DEFAULT_WATCH_MS, watch: bool = True) -> FastAPI:
    """``git``: None = on when the checkout has an ``origin`` remote (``--no-git`` = False).

    The watcher and the git writer start with the app's lifespan (uvicorn, or a
    ``with TestClient(app)`` block); without it writes still publish directly.
    """
    cfg = repo if isinstance(repo, MapConfig) else setup(repo)
    from server.store import (MEMBERSHIPS, PROJECT, PROJECT_ID, USER_BY_NAME, USERS, ApiError,
                              Store)  # after setup(): mapkit is importable now

    broker = Broker()
    banner = Banner()
    store = Store(cfg, on_change=broker.publish)
    store.banner = banner
    if git is None:
        git = has_origin(cfg.repo_root)
    writer: Optional[GitWriter] = None
    if git:
        items_rel = os.path.relpath(cfg.items_dir, cfg.repo_root).replace(os.sep, "/")
        writer = GitWriter(cfg.repo_root, banner, items_rel=items_rel,
                           debounce_ms=debounce_ms, lock=store._lock)
        if writer.start():
            store.writer = writer
        else:
            store.read_only = banner.get()["message"]
    watcher = Watcher(store, broker.publish, watch_ms=watch_ms) if watch else None
    dist = dist_dir if dist_dir is not None else DEFAULT_DIST
    have_dist = os.path.isfile(os.path.join(dist, "index.html"))

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> Any:
        if watcher is not None:
            try:
                watcher.start()
                store.watcher = watcher
            except Exception:  # no inotify: writes still publish directly
                log.exception("jugglebot-map: file watcher failed to start")
        try:
            yield
        finally:
            store.watcher = None
            if watcher is not None:
                watcher.stop()
            if writer is not None:
                writer.stop()
                writer.flush()  # do not strand an edit inside the debounce window

    app = FastAPI(title="jugglebot-map", version="0.1.0", lifespan=lifespan)
    app.state.store = store
    app.state.broker = broker
    app.state.config = cfg
    app.state.banner = banner
    app.state.writer = writer
    app.state.watcher = watcher

    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(exc.payload, status_code=exc.status)

    r = APIRouter()
    P = "/projects/{project_id}"

    def _project(project_id: str) -> None:
        if project_id != PROJECT_ID:
            raise ApiError(404, {"detail": "project not found"})

    def _me(request: Request) -> Dict[str, Any]:
        return USER_BY_NAME.get((request.headers.get("X-Dev-User") or "harrison").lower(), USERS[0])

    # --- users ----------------------------------------------------------------
    @r.get("/users", response_model=List[User])
    def list_users() -> Any:
        return USERS

    @r.get("/users/me", response_model=Me)
    def get_me(request: Request) -> Any:
        return dict(_me(request), is_availability_member=False)

    @r.patch("/users/me", response_model=Me)
    async def patch_me(request: Request) -> Any:
        me = _me(request)
        me.update({k: v for k, v in (await _json_body(request)).items() if k in ("color", "dark_mode")})
        return dict(me, is_availability_member=False)

    # --- projects -------------------------------------------------------------
    @r.get("/projects", response_model=List[Project])
    def list_projects() -> Any:
        return [PROJECT]

    @r.get(P, response_model=Project)
    def get_project(project_id: str) -> Any:
        _project(project_id)
        return PROJECT

    @r.get(P + "/memberships", response_model=List[Membership])
    def memberships(project_id: str) -> Any:
        _project(project_id)
        return MEMBERSHIPS

    # --- tasks ------------------------------------------------------------------
    @r.get(P + "/tasks", response_model=List[Task])
    def list_tasks(project_id: str) -> Any:
        _project(project_id)
        return store.tasks()

    @r.post(P + "/tasks", response_model=Task, status_code=201)
    async def create_task(project_id: str, request: Request) -> Any:
        _project(project_id)
        user = (request.headers.get("X-Dev-User") or "harrison").lower()
        return store.create(await _json_body(request), user=user)

    @r.get(P + "/tasks/{task_id}", response_model=TaskDetail)
    def get_task(project_id: str, task_id: str) -> Any:
        _project(project_id)
        return store.task_detail(task_id)

    @r.patch(P + "/tasks/{task_id}", response_model=Task)
    async def patch_task(project_id: str, task_id: str, request: Request) -> Any:
        _project(project_id)
        body = await _json_body(request)
        return store.update(task_id, body, token=request.query_params.get("if_unchanged_since"))

    @r.delete(P + "/tasks/{task_id}", status_code=204)
    async def delete_task(project_id: str, task_id: str, request: Request) -> Response:
        _project(project_id)
        store.delete(task_id, token=_token(request, await _json_body(request)))
        return Response(status_code=204)

    # --- dependencies -----------------------------------------------------------
    @r.get(P + "/dependencies", response_model=List[Dependency])
    def list_dependencies(project_id: str) -> Any:
        _project(project_id)
        return store.dependencies()

    @r.post(P + "/dependencies", response_model=Dependency, status_code=201)
    async def add_dependency(project_id: str, request: Request) -> Any:
        _project(project_id)
        b = await _json_body(request)
        return store.add_dependency(b.get("blocker_id"), b.get("blocked_id"))

    @r.delete(P + "/dependencies/{dep_id}", status_code=204)
    def delete_dependency(project_id: str, dep_id: str) -> Response:
        _project(project_id)
        store.delete_dependency(dep_id)
        return Response(status_code=204)

    # --- quiet stubs (prototype parity) ----------------------------------------
    @r.get("/users/me/tasks")
    def my_tasks() -> Any:
        return []

    @r.get("/users/me/notifications")
    def notifications() -> Any:
        return []

    @r.get("/users/me/notifications/unread_count", response_model=Count)
    def unread_count() -> Any:
        return {"count": 0}

    @r.get("/users/me/notifications/stream")
    def notifications_stream() -> Any:
        raise ApiError(404, {"detail": "no notification stream"})

    @r.post(P + "/undo")
    def undo(project_id: str) -> Any:
        raise ApiError(404, {"detail": "Nothing to undo"})

    @r.get(P + "/tasks/{task_id}/comments")
    def comments(project_id: str, task_id: str) -> Any:
        return []

    # --- health and events ----------------------------------------------------
    @r.get("/health", response_model=Health)
    def health() -> Any:
        return store.health()

    @r.get("/events")
    def events() -> StreamingResponse:
        return StreamingResponse(broker.stream(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    app.include_router(r, prefix="/api/v1")
    app.include_router(r)

    # --- the built frontend ---------------------------------------------------
    if have_dist:
        index_html = os.path.join(dist, "index.html")

        @app.middleware("http")
        async def spa_fallback(request: Request, call_next: Any) -> Any:
            path = request.url.path
            if request.method == "GET" and not path.startswith("/api/") \
                    and "text/html" in request.headers.get("accept", ""):
                candidate = os.path.normpath(os.path.join(dist, path.lstrip("/")))
                if candidate.startswith(dist) and os.path.isfile(candidate):
                    return FileResponse(candidate)
                return FileResponse(index_html)
            return await call_next(request)

        app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
    else:
        log.warning(BUILD_HINT)

        @app.get("/", response_class=PlainTextResponse)
        def no_build() -> str:
            return BUILD_HINT

    app.state.have_dist = have_dist
    return app
