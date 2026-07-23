export type ChangelogTag = "New" | "Improved" | "Fixed";

export type ChangelogEntry = {
  /** ISO date (yyyy-mm-dd) the change shipped. */
  date: string;
  title: string;
  tag: ChangelogTag;
  items: string[];
};

/** localStorage key holding the newest entry date the user has viewed. */
export const CHANGELOG_SEEN_KEY = "runplan-changelog-seen";

/** Newest first — add new releases at the top. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-07-23",
    title: "Changelog",
    tag: "New",
    items: [
      "This page! Every update to RunPlan is now listed here, newest first.",
      "Find it any time from Settings → What's new.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Send workouts to Garmin",
    tag: "New",
    items: [
      "Push any planned session to Garmin Connect as a structured workout — it appears on your watch automatically, no cables needed.",
      "Auto-send (on by default when Garmin is connected) keeps your next 7 days of sessions scheduled on your watch, and re-sends a workout if you edit it.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Garmin sync and workout details",
    tag: "New",
    items: [
      "Connect your Garmin account in Settings and completed runs tick themselves off against the plan.",
      "New workout detail page: planned vs actual, route map, heart rate, pace and elevation charts, and lap splits.",
      "No Garmin? Upload a .fit file (or Garmin export .zip) on the workout page instead.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Race course and countdown",
    tag: "New",
    items: [
      "Upload your race's GPX file on the plan page to see the course map, elevation profile and climb stats.",
      "The plan page now counts down the days to race day.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Take your workouts to your watch",
    tag: "New",
    items: [
      "Export any session as a .FIT structured workout and copy it to your watch over USB.",
      "Warm-ups, intervals, recoveries and paces all come across as proper workout steps.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Install RunPlan on your phone",
    tag: "New",
    items: [
      "RunPlan is now an installable app: grab the Android APK from Settings, or use your browser's “Add to Home Screen” on any device.",
      "Basic offline support so the app still opens without a connection.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Smarter long runs",
    tag: "Improved",
    items: [
      "Half-marathon to marathon plans now build race-pace work into long runs: broken intervals in the lactate-threshold phase, bigger continuous blocks as race day approaches, easing off in the taper.",
      "Workout distances are now whole kilometres (race day stays exact, e.g. 21.1 km).",
    ],
  },
  {
    date: "2026-07-22",
    title: "Sign-in upgrades",
    tag: "New",
    items: [
      "Passkeys: sign in with your fingerprint or face — no password needed.",
      "Sign in with Google.",
      "Forgotten-password reset by email, plus email verification for new accounts.",
    ],
  },
  {
    date: "2026-07-22",
    title: "RunPlan Pro",
    tag: "New",
    items: [
      "Pro subscription (£1.99/month or £14.99/year): unlimited plans, Garmin sync and workout details, FIT export and upload.",
      "The free tier keeps one active plan, manual tracking and PDF export — forever.",
    ],
  },
  {
    date: "2026-07-22",
    title: "Accessibility",
    tag: "Improved",
    items: [
      "New text-size slider in Settings (85–140%), remembered per device.",
    ],
  },
  {
    date: "2026-07-21",
    title: "RunPlan launches",
    tag: "New",
    items: [
      "Generate a personalised training plan from a recent race result and a goal race — built on VDOT pacing and Pfitzinger-style structure.",
      "Distances from 5k to the marathon, plus ultras: 50k, 100k, 100 miles or any custom distance.",
      "Dashboard with your weekly schedule, plan PDF export, and light/dark themes.",
    ],
  },
];

export const LATEST_CHANGELOG_DATE = CHANGELOG[0]?.date ?? "";
