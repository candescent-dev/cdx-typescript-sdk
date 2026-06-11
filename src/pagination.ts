/**
 * Lazy, async-iterable pagination.
 *
 * Provides both async-iterator protocol and convenience helpers
 * like .toArray(), .map(), .take().
 */

export interface Page<T> {
  items: T[];
  hasMore: boolean;
  nextPageToken?: string;
  totalElements?: number;
}

export interface PageRequest {
  page?: number;
  size?: number;
  pageToken?: string;
}

export type PageFetcher<T> = (request: PageRequest) => Promise<Page<T>>;

export class PageIterator<T> implements AsyncIterable<T> {
  private static readonly MAX_PAGES = 1000;

  private readonly fetcher: PageFetcher<T>;
  private readonly initialRequest: PageRequest;

  constructor(
    fetcher: PageFetcher<T>,
    initialRequest: PageRequest = { page: 0, size: 25 },
  ) {
    this.fetcher = fetcher;
    this.initialRequest = initialRequest;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let request: PageRequest = { ...this.initialRequest };
    let hasMore = true;
    let pageCount = 0;
    let prevToken: string | undefined;

    while (hasMore) {
      if (++pageCount > PageIterator.MAX_PAGES) {
        throw new Error(`PageIterator: exceeded ${PageIterator.MAX_PAGES} pages — possible infinite loop`);
      }

      const page = await this.fetcher(request);
      const items = page.items ?? [];
      for (const item of items) yield item;

      hasMore = page.hasMore;
      if (hasMore) {
        if (page.nextPageToken) {
          if (page.nextPageToken === prevToken) {
            throw new Error("PageIterator: nextPageToken did not change — aborting to prevent infinite loop");
          }
          prevToken = page.nextPageToken;
          request = { ...request, pageToken: page.nextPageToken };
        } else {
          request = { ...request, page: (request.page ?? 0) + 1 };
        }
      }
    }
  }

  /** Collect all pages into a single array. */
  async toArray(): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) items.push(item);
    return items;
  }

  /** Return the first N items. */
  async take(n: number): Promise<T[]> {
    const items: T[] = [];
    for await (const item of this) {
      items.push(item);
      if (items.length >= n) break;
    }
    return items;
  }

  /** Async map over all paginated results. */
  async map<U>(fn: (item: T) => U | Promise<U>): Promise<U[]> {
    const results: U[] = [];
    for await (const item of this) results.push(await fn(item));
    return results;
  }
}
