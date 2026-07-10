// Global time-based landing pages made redundant by the in-page landing date
// filter (components/LandingDateFilter.tsx). Related-link pills pointing at
// these are hidden wherever the filter renders, so a landing page doesn't show
// two near-identical rows of date chips. Lives outside the 'use client'
// component so server components (Renderer, EventLanding) can call .has() on it.
export const DATE_LANDING_HREFS = new Set([
  '/events/today',
  '/events/this-weekend',
  '/events/this-month',
])
