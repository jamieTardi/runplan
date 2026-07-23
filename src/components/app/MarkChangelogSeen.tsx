"use client";

import { useEffect } from "react";
import { CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_DATE } from "@/lib/changelog";

/** Records (per device) that the user has viewed the latest changelog entries. */
export function MarkChangelogSeen() {
  useEffect(() => {
    localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_DATE);
  }, []);
  return null;
}
