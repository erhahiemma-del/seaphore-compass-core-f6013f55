import { useQuery } from "@tanstack/react-query";
import { listDataSources } from "@/services/data-sources.service";

export function useDataSources() {
  return useQuery({
    queryKey: ["data-sources"],
    queryFn: listDataSources,
    staleTime: 60_000,
  });
}
