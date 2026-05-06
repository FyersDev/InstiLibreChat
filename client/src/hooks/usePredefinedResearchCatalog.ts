import { useEffect, useMemo, useState } from 'react';
import type {
  PredefinedResearchAgent,
  PredefinedResearchFramework,
} from '~/services/researchConfluxApi';
import { saasApi } from '~/services/saasApi';

export type PredefinedFrameworkMap = Record<
  string,
  { name: string; fields: Record<string, string> }
>;

type Catalog = {
  agents: PredefinedResearchAgent[];
  frameworks: PredefinedResearchFramework[];
};

const catalogSingleton: {
  data: Catalog | null;
  promise: Promise<Catalog> | null;
} = {
  data: null,
  promise: null,
};

async function loadPredefinedCatalog(): Promise<Catalog> {
  if (catalogSingleton.data) {
    return catalogSingleton.data;
  }
  if (catalogSingleton.promise) {
    return catalogSingleton.promise;
  }
  catalogSingleton.promise = (async () => {
    const [agentsRes, frameworksRes] = await Promise.all([
      saasApi.getPredefinedAgents(),
      saasApi.getPredefinedFrameworks(),
    ]);
    const catalog: Catalog = {
      agents: agentsRes.data ?? [],
      frameworks: frameworksRes.data ?? [],
    };
    catalogSingleton.data = catalog;
    return catalog;
  })();
  try {
    return await catalogSingleton.promise;
  } finally {
    catalogSingleton.promise = null;
  }
}

/**
 * FYERS org predefined agents + frameworks (`/research/predefined-agents`, `predefined-frameworks`).
 * Uses a module singleton so multiple modals share one fetch per session.
 */
export function usePredefinedResearchCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(catalogSingleton.data);
  const [loading, setLoading] = useState(!catalogSingleton.data);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(!catalogSingleton.data);
    loadPredefinedCatalog()
      .then((c) => {
        if (!cancelled) {
          setCatalog(c);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load catalog');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const frameworksByCode = useMemo((): PredefinedFrameworkMap => {
    const m: PredefinedFrameworkMap = {};
    for (const fw of catalog?.frameworks ?? []) {
      const code = (fw.code || '').trim();
      if (!code) {
        continue;
      }
      m[code] = {
        name: fw.name,
        fields:
          fw.fields && typeof fw.fields === 'object' && !Array.isArray(fw.fields)
            ? { ...fw.fields }
            : {},
      };
    }
    return m;
  }, [catalog?.frameworks]);

  const sortedFrameworks = useMemo(
    () =>
      [...(catalog?.frameworks ?? [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      ),
    [catalog?.frameworks],
  );

  const sortedAgents = useMemo(
    () =>
      [...(catalog?.agents ?? [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      ),
    [catalog?.agents],
  );

  return {
    agents: sortedAgents,
    frameworkList: sortedFrameworks,
    frameworksByCode,
    loading,
    error,
  };
}
