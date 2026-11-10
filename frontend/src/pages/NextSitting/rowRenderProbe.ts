/** Test seam: called with the step number each time a StepRow renders (render-count tests). */
export const rowRenderProbe: { hook: ((n: number) => void) | null } = { hook: null };
