import { absRequest } from "@/services/audiobookshelf/index";
import type {
  AbsAuthor,
  AbsCollection,
  AbsFilterData,
  AbsLibraryItem,
  AbsMediaProgress,
  AbsPage,
  AbsSearchResult,
  AbsSeries,
  AbsShelf,
} from "@/services/audiobookshelf/types";

export async function getPersonalizedShelves(
  libraryId: string,
): Promise<AbsShelf[]> {
  return absRequest<AbsShelf[]>(
    `/api/libraries/${encodeURIComponent(libraryId)}/personalized`,
    { params: { limit: 12, include: "rssfeed,numEpisodesIncomplete" } },
  );
}

export type AbsItemsSort =
  | "sequence"
  | "media.metadata.title"
  | "media.metadata.authorName"
  | "media.metadata.publishedYear"
  | "media.duration"
  | "addedAt"
  | "progress";

export interface AbsItemsQuery {
  libraryId: string;
  page: number;
  limit?: number;
  sort?: AbsItemsSort;
  desc?: boolean;
  /** `<group>.<base64(value)>`, the encoding the web client uses. */
  filter?: string;
}

export async function getLibraryItems({
  libraryId,
  page,
  limit = 50,
  sort = "media.metadata.title",
  desc = false,
  filter,
}: AbsItemsQuery): Promise<AbsPage<AbsLibraryItem>> {
  return absRequest<AbsPage<AbsLibraryItem>>(
    `/api/libraries/${encodeURIComponent(libraryId)}/items`,
    {
      params: {
        page,
        limit,
        sort,
        desc: desc ? 1 : 0,
        filter,
        minified: 1,
        include: "progress",
      },
    },
  );
}

// ABS filters are `group.value` with the value base64-encoded, then
// URI-encoded, exactly as its web client builds them.
export function encodeFilter(group: string, value: string): string {
  const bytes = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return `${group}.${encodeURIComponent(btoa(bytes))}`;
}

export async function getLibraryItem(itemId: string): Promise<AbsLibraryItem> {
  return absRequest<AbsLibraryItem>(
    `/api/items/${encodeURIComponent(itemId)}`,
    {
      params: { expanded: 1, include: "progress" },
      notFoundIsExpected: true,
    },
  );
}

export async function deleteLibraryItem(
  itemId: string,
  deleteFiles: boolean,
): Promise<void> {
  await absRequest(`/api/items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    params: deleteFiles ? { hard: 1 } : undefined,
  });
}

export async function searchLibrary(
  libraryId: string,
  query: string,
): Promise<AbsSearchResult> {
  return absRequest<AbsSearchResult>(
    `/api/libraries/${encodeURIComponent(libraryId)}/search`,
    { params: { q: query, limit: 25 } },
  );
}

export async function getFilterData(libraryId: string): Promise<AbsFilterData> {
  return absRequest<AbsFilterData>(
    `/api/libraries/${encodeURIComponent(libraryId)}/filterdata`,
  );
}

export async function getSeriesList(
  libraryId: string,
  page: number,
  limit = 50,
): Promise<AbsPage<AbsSeries>> {
  return absRequest<AbsPage<AbsSeries>>(
    `/api/libraries/${encodeURIComponent(libraryId)}/series`,
    { params: { page, limit, sort: "name", minified: 1 } },
  );
}

export async function getSeries(
  libraryId: string,
  seriesId: string,
): Promise<AbsSeries> {
  return absRequest<AbsSeries>(
    `/api/libraries/${encodeURIComponent(libraryId)}/series/${encodeURIComponent(seriesId)}`,
    { notFoundIsExpected: true },
  );
}

// The series endpoint carries no books, so they come from the items list
// filtered on the series, in reading order.
export async function getSeriesBooks(
  libraryId: string,
  seriesId: string,
): Promise<AbsLibraryItem[]> {
  const page = await getLibraryItems({
    libraryId,
    page: 0,
    limit: 500,
    sort: "sequence",
    filter: encodeFilter("series", seriesId),
  });
  return page.results;
}

export async function getAuthors(libraryId: string): Promise<AbsAuthor[]> {
  const data = await absRequest<{ authors: AbsAuthor[] }>(
    `/api/libraries/${encodeURIComponent(libraryId)}/authors`,
  );
  return data.authors;
}

export async function getAuthor(authorId: string): Promise<AbsAuthor> {
  return absRequest<AbsAuthor>(`/api/authors/${encodeURIComponent(authorId)}`, {
    params: { include: "items,series" },
    notFoundIsExpected: true,
  });
}

export async function getCollections(
  libraryId: string,
): Promise<AbsCollection[]> {
  const data = await absRequest<{ results: AbsCollection[] }>(
    `/api/libraries/${encodeURIComponent(libraryId)}/collections`,
    { params: { minified: 1 } },
  );
  return data.results;
}

export async function getCollection(
  collectionId: string,
): Promise<AbsCollection> {
  return absRequest<AbsCollection>(
    `/api/collections/${encodeURIComponent(collectionId)}`,
    { notFoundIsExpected: true },
  );
}

export async function getNarrators(
  libraryId: string,
): Promise<{ id: string; name: string; numBooks: number }[]> {
  const data = await absRequest<{
    narrators: { id: string; name: string; numBooks: number }[];
  }>(`/api/libraries/${encodeURIComponent(libraryId)}/narrators`);
  return data.narrators;
}

export async function getMediaProgress(
  itemId: string,
): Promise<AbsMediaProgress | null> {
  try {
    return await absRequest<AbsMediaProgress>(
      `/api/me/progress/${encodeURIComponent(itemId)}`,
      { notFoundIsExpected: true },
    );
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404)
      return null;
    throw error;
  }
}

export async function updateMediaProgress(
  itemId: string,
  patch: {
    isFinished?: boolean;
    currentTime?: number;
    duration?: number;
    progress?: number;
  },
): Promise<void> {
  await absRequest(`/api/me/progress/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    data: patch,
  });
}

export async function removeMediaProgress(progressId: string): Promise<void> {
  await absRequest(`/api/me/progress/${encodeURIComponent(progressId)}`, {
    method: "DELETE",
  });
}

export async function getItemsInProgress(): Promise<AbsLibraryItem[]> {
  const data = await absRequest<{ libraryItems: AbsLibraryItem[] }>(
    "/api/me/items-in-progress",
  );
  return data.libraryItems;
}
