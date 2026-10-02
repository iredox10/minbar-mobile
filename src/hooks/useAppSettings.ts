import { useEffect, useState } from "react";

import { getAppSettings } from "@/lib/appwrite";
import type { AppSettingsDoc } from "@/types";

/**
 * Fail-OPEN default: when the `global_config` document is missing or the read
 * fails we keep donations visible, matching web (minbar/src/hooks/useAppSettings.ts).
 */
export const defaultAppSettings: AppSettingsDoc = {
  $id: "global_config",
  paystackUrl: "",
  flutterwaveUrl: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  isDonationsEnabled: true,
};

// Single in-flight/settled fetch shared by every consumer so N mounted screens
// cause one network read instead of N.
let cached: Promise<AppSettingsDoc> | null = null;

function loadAppSettings(): Promise<AppSettingsDoc> {
  if (!cached) {
    cached = getAppSettings()
      .then((data) => (data ? { ...defaultAppSettings, ...data } : defaultAppSettings))
      .catch(() => defaultAppSettings);
  }
  return cached;
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettingsDoc>(defaultAppSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadAppSettings().then((data) => {
      if (!mounted) return;
      setSettings(data);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { settings, loading };
}

/** Test/admin escape hatch: drop the memoised settings fetch. */
export function resetAppSettingsCache() {
  cached = null;
}