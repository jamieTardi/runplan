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
    date: "2026-07-31",
    title: "Completed runs survive plan rebuilds untouched",
    tag: "Fixed",
    items: [
      "Updating a plan (\"Update workouts\", a missed-training rebuild, or the weekly auto-update) no longer relabels sessions you've already done. Completed and missed runs now keep their original workout type, distance and paces through any rebuild — previously they could be re-attached to a different session type, which skewed the race estimator's VDOT. If your estimator reading recently jumped after a plan update, correcting those workouts' types (or this fix plus your next runs) will settle it.",
    ],
  },
  {
    date: "2026-07-31",
    title: "Weekly auto-updating plans",
    tag: "New",
    items: [
      "Your plan can now keep itself in tune: turn on weekly auto-update (the calendar-sync button on the plan page) and every Sunday evening RunPlan re-checks your current VDOT from your recorded runs. If your fitness has genuinely moved (half a VDOT point or more), the remaining weeks are re-paced to match — completed runs, notes and Garmin history untouched, goal time unchanged. Off by default; small wobbles are ignored so your paces aren't churning week to week.",
    ],
  },
  {
    date: "2026-07-31",
    title: "Recalibrate your plan's paces to your current fitness",
    tag: "New",
    items: [
      "\"Update workouts\" can now set your training paces from your current VDOT instead of the one your plan was created with. If your fitness has moved on — or the plan was set up a touch optimistic — tick \"Set paces from your current VDOT\" and every remaining week is re-planned with easy and workout paces that match how you're actually running. Your goal time stays the same; the VDOT is worked out from your recorded runs, and the option appears once there's enough data.",
    ],
  },
  {
    date: "2026-07-31",
    title: "Synced crosshairs on activity charts",
    tag: "Improved",
    items: [
      "On the workout detail page, hovering (or tapping) the heart-rate, pace or elevation chart now shows the crosshair and value at the same spot on all the other charts too — so you can read HR, pace and elevation together at any point of the run. Pinning with a click still works, and the route map keeps tracking the same position.",
    ],
  },
  {
    date: "2026-07-31",
    title: "Deleting a plan tidies up Garmin too",
    tag: "Improved",
    items: [
      "Deleting a plan now also removes the workouts it sent to Garmin Connect — no more orphaned sessions in your workout library or on your watch calendar after a plan is gone.",
    ],
  },
  {
    date: "2026-07-31",
    title: "See your updated VDOT",
    tag: "New",
    items: [
      "The race estimator now shows your current VDOT — the Daniels fitness score calculated from your recorded runs — alongside how far it's moved since your plan's paces were set. Watch it climb as training lands.",
      "\"Plan your next race\" shows the updated VDOT behind its suggested goal time, so you can see exactly what fitness your follow-up plan is being built on.",
    ],
  },
  {
    date: "2026-07-30",
    title: "Continue your training into a next race",
    tag: "New",
    items: [
      "New \"Next race\" button on the plan page: chain a follow-up race straight onto your current plan — for example a marathon 4–6 weeks after your half. The new plan starts the Monday after race day with proper post-race recovery (two easy weeks after a marathon or longer, one otherwise), rebuilds on the fitness you've already banked, and tapers into the new race. No starting from scratch.",
      "Your goal time for the next race is pre-filled from an equivalent-effort estimate — based on your recorded finish when you've logged one, or your goal time otherwise. Gaps long enough for a full training block (8+ weeks after recovery) get the complete periodised build.",
    ],
  },
  {
    date: "2026-07-29",
    title: "Strength on existing plans + plan locking",
    tag: "New",
    items: [
      "\"Update workouts\" can now add strength sessions to a plan that's already under way — tick \"Include strength sessions\" in the dialog and the remaining weeks are re-planned with two short bodyweight routines a week. Works on every race distance.",
      "You can now lock a plan (padlock button on the plan page). A locked plan can't be deleted until you deliberately unlock it — protection against a stray tap on the bin.",
    ],
  },
  {
    date: "2026-07-29",
    title: "Update an existing plan to the latest training engine",
    tag: "New",
    items: [
      "New \"Update workouts\" button on the plan page: re-plans this week and every week ahead with the latest RunPlan improvements, using your plan's current settings. Past weeks, completed runs, recorded times, notes and Garmin history are all kept — so plans created before an improvement (like the recent long-run fix) can pick it up without starting over.",
    ],
  },
  {
    date: "2026-07-29",
    title: "Right-sized long runs and race week on lower-volume plans",
    tag: "Fixed",
    items: [
      "Marathon and half-marathon plans built on modest weekly volume now grow the weekly long run toward the race distance — a first-marathon plan peaks around a 32 km long run instead of stalling near 16 km. Beginner marathon plans also peak slightly higher (~55 km/week). Existing plans keep their current schedule until rebuilt or regenerated.",
      "Race week now matches the runner too: the number and length of the final easy runs scale with your training volume and days per week, instead of everyone getting the same 26 km high-mileage taper week.",
    ],
  },
  {
    date: "2026-07-29",
    title: "Net elevation per lap",
    tag: "Improved",
    items: [
      "The laps table on the workout detail page now shows net elevation change per lap (gain minus loss, e.g. −12 m on a descent) instead of climb only, and the activity summary shows elevation loss alongside gain.",
      "Activities viewed before this change had no per-lap loss data stored and could show +0 m on downhill kilometres — they now refresh themselves automatically the next time you open them.",
    ],
  },
  {
    date: "2026-07-26",
    title: "Strides on easy runs + workout guide",
    tag: "New",
    items: [
      "One easy run a week now finishes with 6 × 20-second strides — relaxed accelerations that sharpen form and leg speed without adding fatigue. Newly generated plans pick them up automatically; cutback weeks stay fully relaxed.",
      "Not sure what a threshold run or a VO₂max session actually is? Every workout type now has a plain-English explanation — tap any session to read it, or open the new \"Workout guide\" at the bottom of your plan page.",
    ],
  },
  {
    date: "2026-07-24",
    title: "Beginner-friendly setup",
    tag: "New",
    items: [
      "New runners get a simple way in: the plan builder now opens with \"Keep it simple\" — pick your race, say how your running feels right now, and RunPlan works out the paces, volumes and goal for you.",
      "Choose \"Finish comfortably\" and we set a realistic target from your current fitness — no need to guess a finish time. Beginner plans also remind you that walk breaks are fine on easy runs.",
      "Seasoned runners: \"I know my numbers\" is the full setup you already have, unchanged.",
    ],
  },
  {
    date: "2026-07-24",
    title: "Strength sessions",
    tag: "New",
    items: [
      "Plans can now include strength work — tick \"Include strength sessions\" when building a plan (or in Edit plan → rebuild) for two short bodyweight routines a week on easy days.",
      "They're deliberately runner-sized: 15–20 minutes, no gym needed, one session during taper and none in race week. They don't count toward mileage and are never sent to your watch.",
    ],
  },
  {
    date: "2026-07-24",
    title: "Daily workout notifications",
    tag: "New",
    items: [
      "Turn on the daily reminder in Settings → Notifications and RunPlan sends a morning push with the day's session — type, distance and pace at a glance.",
      "Works in the Android app and in any browser where you allow notifications. Rest days stay quiet.",
    ],
  },
  {
    date: "2026-07-24",
    title: "Free month & plan limits",
    tag: "Improved",
    items: [
      "Free accounts can build plans during their first month — after that, creating new plans is a RunPlan Pro feature. Your existing plans stay fully usable: keep training, ticking off runs and viewing everything.",
      "To keep things fast for everyone, each account can hold up to 10 plans — delete an old plan to make room for a new one.",
    ],
  },
  {
    date: "2026-07-24",
    title: "Race estimator",
    tag: "New",
    items: [
      "Your plan page now predicts your race finish time from completed training — every run with recorded time and distance (Garmin sync or FIT upload) feeds the estimate.",
      "Workouts and races count more than easy mileage, recent runs count more than old ones, and the card shows a realistic range, your trend, and how the prediction compares to your goal.",
    ],
  },
  {
    date: "2026-07-23",
    title: "Double run days",
    tag: "New",
    items: [
      "High-volume plans can now schedule doubles: turn on \u201cdouble run days\u201d when creating or editing a plan and long easy days split into a main AM run plus a short PM shakeout (max twice a week).",
      "Doubles follow sensible rules \u2014 never the long run, quality days or the day before your long run, and cutback, taper and race weeks stay single runs.",
    ],
  },
  {
    date: "2026-07-23",
    title: "Missed training & safe comeback",
    tag: "New",
    items: [
      "Life happens: mark a day — or weeks — of training as missed (injury or life) from the plan page.",
      "RunPlan rebuilds the rest of your plan around the break: you resume at a reduced volume, hard sessions pause while you ease back in, and weekly load builds up gradually so you don't get injured coming back.",
      "Missed sessions no longer count against your progress, and Garmin won't try to match runs to them.",
    ],
  },
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
