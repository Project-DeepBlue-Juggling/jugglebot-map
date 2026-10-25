import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  GUI_PREFS_KEY,
  handleMessage,
  isSameHostname,
  loadPrefs,
  parsePrefs,
  resetPrefsForTest,
} from './guiPrefs';
import { useGuiPrefs, useGuiPrefsListener } from './useGuiPrefs';

const HOST = window.location.hostname;
const good = { type: 'jugglebot-gui-prefs', theme: 'light', fontSize: 18 };

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.removeProperty('--app-zoom');
  resetPrefsForTest(null);
  document.documentElement.style.removeProperty('--app-zoom');
});
afterEach(cleanup);

describe('parsePrefs', () => {
  it('accepts valid data and clamps the font size to 10..22', () => {
    expect(parsePrefs(good)).toEqual({ theme: 'light', fontSize: 18 });
    expect(parsePrefs({ ...good, fontSize: 4 })?.fontSize).toBe(10);
    expect(parsePrefs({ ...good, fontSize: 40 })?.fontSize).toBe(22);
  });
  it('rejects malformed data', () => {
    for (const bad of [null, 'x', 3, {}, { ...good, theme: 'blue' }, { ...good, fontSize: '14' }, { ...good, fontSize: 14.5 }, { ...good, fontSize: NaN }]) {
      expect(parsePrefs(bad)).toBeNull();
    }
  });
});

describe('handleMessage', () => {
  it('accepts a same-hostname message on any port, persists it and sets the zoom var', () => {
    expect(isSameHostname(`http://${HOST}:8081`)).toBe(true);
    expect(handleMessage({ origin: `http://${HOST}:8081`, data: good })).toBe(true);
    expect(loadPrefs()).toEqual({ theme: 'light', fontSize: 18 });
    expect(JSON.parse(window.localStorage.getItem(GUI_PREFS_KEY) ?? 'null')).toEqual({ theme: 'light', fontSize: 18 });
    expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe(String(18 / 14));
  });
  it('rejects another hostname, a bad origin, a wrong type and malformed data', () => {
    expect(handleMessage({ origin: 'http://evil.example:8081', data: good })).toBe(false);
    expect(handleMessage({ origin: 'null', data: good })).toBe(false);
    expect(handleMessage({ origin: `http://${HOST}:1`, data: { ...good, type: 'other' } })).toBe(false);
    expect(handleMessage({ origin: `http://${HOST}:1`, data: { ...good, fontSize: 'big' } })).toBe(false);
    expect(handleMessage({ origin: `http://${HOST}:1`, data: 'junk' })).toBe(false);
    expect(window.localStorage.getItem(GUI_PREFS_KEY)).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe('');
  });
});

describe('listener + ThemeProvider precedence', () => {
  async function mountProvider() {
    const { ThemeProvider } = await import('../ui/ThemeProvider');
    const { AuthProvider } = await import('../auth/AuthContext');
    const { StaticAuthClient } = await import('../auth/StaticAuthClient');
    const { ApiProvider } = await import('../api/ApiContext');
    const qc = new QueryClient();
    return render(
      <AuthProvider client={new StaticAuthClient()}>
        <QueryClientProvider client={qc}>
          <ApiProvider>
            <ThemeProvider>
              <span>child</span>
            </ThemeProvider>
          </ApiProvider>
        </QueryClientProvider>
      </AuthProvider>,
    );
  }

  it('a posted message flips the dark class and zoom; the GUI pref beats the default', async () => {
    document.documentElement.classList.add('dark');
    await mountProvider();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: `http://${HOST}:8081`, data: good }));
    });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--app-zoom')).toBe(String(18 / 14));
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { origin: `http://${HOST}:8081`, data: { ...good, theme: 'dark', fontSize: 10 } }),
      );
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('ignores a foreign-origin message', async () => {
    document.documentElement.classList.add('dark');
    await mountProvider();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: 'http://evil.example', data: good }));
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem(GUI_PREFS_KEY)).toBeNull();
  });

  it('a persisted pref (iframe reload) beats the stored user preference', async () => {
    document.documentElement.classList.add('dark');
    resetPrefsForTest({ theme: 'light', fontSize: 14 });
    await mountProvider();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('hooks are importable standalone', () => {
    function Probe() {
      useGuiPrefsListener();
      return <span>{useGuiPrefs()?.theme ?? 'none'}</span>;
    }
    const { container } = render(<Probe />);
    expect(container.textContent).toBe('none');
  });
});
