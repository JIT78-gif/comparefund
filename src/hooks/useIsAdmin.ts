import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";

export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMe()
      .then((data) => setIsAdmin(data.roles.includes("admin")))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, []);

  return { isAdmin, loading };
}
