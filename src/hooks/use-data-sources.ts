import { useQuery } from "@tanstack/react-query";
import { listDataSources } from "@/services/data-sources.service";
import { QUERY_KEYS } from "@/lib/query-keys";

export function useDataSources() {
  return useQuery({
    queryKey: QUERY_KEYS.dataSources(),
    queryFn: listDataSources,
    staleTime: 60_000,
  });
}
