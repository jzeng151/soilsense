import { lazy, Suspense, type ReactNode } from "react";
import { useI18n } from "../i18n";

/** Isolate each evidence download: it must not blank the planner or steal focus. */
export function deferred<P extends object>(load: () => Promise<{ default: (props: P) => ReactNode }>) {
  const Component = lazy(load);
  return function Deferred(props: P) {
    const { t } = useI18n();
    return <Suspense fallback={<p role="status">{t("Loading…")}</p>}><Component {...props} /></Suspense>;
  };
}
