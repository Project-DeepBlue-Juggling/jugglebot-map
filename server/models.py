"""Pydantic models mirroring the frontend's zod schemas (the full-object rule, ticket #22).

Every field below is REQUIRED in the response: zod rejects an object missing
any declared field, so the models declare no defaults for response fields.
Field names follow the prototype thin server, with ``stage`` renamed ``kind``
(#24) and the map fields added (#25, #34, #37).
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class User(_Strict):
    id: str
    email: str
    display_name: str
    color: str
    dark_mode: str
    created_at: str


class Project(_Strict):
    id: str
    name: str
    stages: List[str]
    due_date_warning_days: int
    created_at: str
    created_by: str


class Membership(_Strict):
    user_id: str
    project_id: str
    role: str
    created_at: str
    created_by: str


class Task(_Strict):
    # prototype fields (stage -> kind)
    id: str
    project_id: str
    parent_id: Optional[str]
    title: str
    description: str
    completion_criteria: str
    assignee_ids: List[str]
    kind: str
    status: str
    priority: Optional[str]
    # item metrics (null = unrated; diagnosis is bugs only)
    effort: Optional[str]
    hardware: Optional[str]
    owner: Optional[str]
    radius: Optional[str]
    diagnosis: Optional[str]
    area: Optional[str]
    is_section: bool
    backlog_rank: float
    color: Optional[str]
    canvas_x: float
    canvas_y: float
    canvas_collapsed: bool
    work_days: Optional[int]
    start_date: Optional[str]
    due_date: Optional[str]
    reviewer_id: Optional[str]
    effective_start_date: Optional[str]
    created_at: str
    created_by: str
    updated_at: str
    updated_by: str
    # map fields
    slug: str
    destination: str
    branch: Optional[str]
    links: List[str]
    filed_by: Optional[str]
    promoted_to: Optional[str]
    rank: Optional[float]
    ticket_type: Optional[str]
    source_path: str
    editable: bool
    pathway_id: Optional[str]
    short_id: Optional[str]      # the Item's JB-<n>; None for plans, phases and an ID-less Item
    unpushed: bool               # filed here and not yet on origin/main: short_id is provisional


class Dependency(_Strict):
    id: str
    blocker_id: str
    blocked_id: str
    created_at: str
    created_by: str


class TaskDetail(Task):
    blocking: List[Dependency]
    blocked_by: List[Dependency]


class Ref(_Strict):
    id: str
    title: str


class ReparentCycleConflict(_Strict):
    detail: str
    would_close_via: Ref


class DependencyCycleConflict(_Strict):
    detail: str


class DeleteConflict(_Strict):
    detail: str
    children: List[Ref]
    blocking: List[Ref]
    blocked_by: List[Ref]


class ModifiedConflict(_Strict):
    detail: str
    current: Task


class Count(_Strict):
    count: int


class HealthError(_Strict):
    path: str
    message: str


class HealthBanner(_Strict):
    level: Optional[str]  # "error" | "warning" | None (clear)
    message: str
    since: Optional[str]


class Health(_Strict):
    status: str
    errors: List[HealthError]
    banner: HealthBanner


class GlossaryTerm(_Strict):
    term: str
    definition: str
    avoid: List[str]
    anchor: str


class GlossaryCluster(_Strict):
    name: str
    terms: List[GlossaryTerm]


class Glossary(_Strict):
    clusters: List[GlossaryCluster]


class NightShiftReport(_Strict):
    date: str
    path: str
    title: str


class NightShiftQuestion(_Strict):
    id: str
    short_id: Optional[str]
    title: str
    body: str
    parent_id: Optional[str]
    parent_short_id: Optional[str]
    parent_title: Optional[str]
    created_at: str
    updated_at: str


class NightShiftSummary(_Strict):
    latest_date: Optional[str]
    open_questions: int


class RunbookResult(_Strict):
    date: str
    verdict: str
    notes: str


class RunbookRow(_Strict):
    task_id: str
    short_id: str
    title: str
    pathway_short_id: Optional[str]
    pathway_title: Optional[str]
    priority: str
    setup: List[str]
    why: str
    do: List[str]
    pass_: str = Field(alias="pass")
    record: str
    minutes: int
    branch: Optional[str]
    score: float
    has_result: bool
    results: List[RunbookResult]


class RunbookBlock(_Strict):
    setup: List[str]
    rows: List[RunbookRow]


class RunbookNeeds(_Strict):
    task_id: str
    short_id: str
    title: str
    errors: List[str]


class RunbookQuestion(_Strict):
    task_id: str
    short_id: str
    title: str
    parent_task_id: Optional[str]
    parent_short_id: str


class Runbook(_Strict):
    blocks: List[RunbookBlock]
    needs_section: List[RunbookNeeds]
    questions: List[RunbookQuestion]
    page: str
