const DEFAULT_PAGE_SIZE = 1000;

type SupabasePage<T> = {
  data: T[] | null;
  error: unknown;
};

export async function fetchAllSupabaseRows<T>(
  pageQuery: (from: number, to: number) => PromiseLike<SupabasePage<T>>,
  pageSize = DEFAULT_PAGE_SIZE,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await pageQuery(from, to);
    if (error) throw error;

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
  }

  return rows;
}
