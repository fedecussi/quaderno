import { useEffect, useState } from "react";

export type Route =
  | { name: "home"; filter: HomeFilter }
  | { name: "board"; id: string }
  | { name: "shared"; payload: string };

export type HomeFilter =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "trash" }
  | { kind: "collection"; id: string };

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, "");
  const m = h.match(/^\/?([^/]*)\/?(.*)$/);
  const seg = m?.[1] ?? "";
  const rest = m?.[2] ?? "";
  switch (seg) {
    case "b":
      return rest ? { name: "board", id: rest } : { name: "home", filter: { kind: "all" } };
    case "s":
      return { name: "shared", payload: rest };
    case "favorites":
      return { name: "home", filter: { kind: "favorites" } };
    case "trash":
      return { name: "home", filter: { kind: "trash" } };
    case "c":
      return rest ? { name: "home", filter: { kind: "collection", id: rest } } : { name: "home", filter: { kind: "all" } };
    default:
      return { name: "home", filter: { kind: "all" } };
  }
}

export function hrefFor(route: Route): string {
  switch (route.name) {
    case "board":
      return `#/b/${route.id}`;
    case "shared":
      return `#/s/${route.payload}`;
    case "home":
      switch (route.filter.kind) {
        case "favorites":
          return "#/favorites";
        case "trash":
          return "#/trash";
        case "collection":
          return `#/c/${route.filter.id}`;
        default:
          return "#/";
      }
  }
}

export function navigate(route: Route, replace = false) {
  const href = hrefFor(route);
  if (replace) history.replaceState(null, "", href);
  else location.hash = href;
  if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
