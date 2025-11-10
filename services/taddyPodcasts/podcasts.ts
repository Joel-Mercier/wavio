import taddyPodcastsApiInstance, {
  type TaddyPodcastsResponse,
} from "@/services/taddyPodcasts/index";
import type {
  Country,
  Genre,
  Language,
  PodcastContentType,
  PodcastEpisode,
  PodcastSeries,
  SearchContentType,
  SearchMatchType,
  SearchRankingDetails,
  SearchResponseDetails,
  SearchSortOrder,
  SortOrder,
  TaddyType,
} from "@/services/taddyPodcasts/types";
import axios from "axios";

export const getPodcastSeries = async ({
  uuid,
  itunesId,
  rssUrl,
  name,
  page,
  limitPerPage,
  sortOrder,
  searchTerm,
}: {
  uuid?: string;
  itunesId?: number;
  rssUrl?: string;
  name?: string;
  page?: number;
  limitPerPage?: number;
  sortOrder?: keyof typeof SortOrder;
  searchTerm?: string;
}) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<PodcastSeries>
    >("", {
      query: `query($uuid: ID, $itunesId: Int, $rssUrl: String, $name: String, $page: Int, $limitPerPage: Int, $sortOrder: SortOrder, $searchTerm: String){
        getPodcastSeries(uuid: $uuid, itunesId: $itunesId, rssUrl: $rssUrl, name: $name){
          uuid
          name
          language
          genres
          description(shouldStripHtmlTags: true)
          datePublished
          imageUrl
          websiteUrl
          totalEpisodesCount
          genres
          authorName
          episodes(sortOrder: $sortOrder, searchTerm: $searchTerm, page: $page, limitPerPage: $limitPerPage){
            uuid
            name
            duration
            description(shouldStripHtmlTags: true)
            datePublished
            audioUrl
            imageUrl
            websiteUrl
            podcastSeries {
              uuid
              name
              imageUrl
              description(shouldStripHtmlTags: true)
              genres
              language
              authorName
            }
          }
        }
      }`,
      variables: {
        uuid,
        itunesId,
        rssUrl,
        name,
        page,
        limitPerPage,
        sortOrder,
        searchTerm,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getLatestPodcastEpisodes = async (uuids: string[]) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<PodcastEpisode[]>
    >("", {
      query: `query($uuids: [ID]) {
        getLatestPodcastEpisodes(uuids: $uuids){
          uuid
          name
          subtitle
          duration
          description(shouldStripHtmlTags: true)
          datePublished
          audioUrl
          imageUrl
          websiteUrl
          podcastSeries {
            uuid
            name
            imageUrl
            genres
            language
            description(shouldStripHtmlTags: true)
            authorName
          }
        }
      }`,
      variables: {
        uuids,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getMultiplePodcastSeries = async (uuids: string[]) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<PodcastSeries[]>
    >("", {
      query: `query($uuids: [ID]){
        getMultiplePodcastSeries(uuids: $uuids){
          uuid
          name
          duration
          description(shouldStripHtmlTags: true)
          datePublished
          imageUrl
          authorName
          websiteUrl
          genres
          language
        }
      }`,
      variables: {
        uuids,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getMultiplePodcastEpisodes = async (uuids: string[]) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<PodcastEpisode[]>
    >("", {
      query: `query($uuids: [ID]) {
        getMultiplePodcastEpisodes(uuids: $uuids){
          uuid
          name
          subtitle
          duration
          description(shouldStripHtmlTags: true)
          datePublished
          audioUrl
          imageUrl
          websiteUrl
          podcastSeries {
            uuid
            name
            imageUrl
            description(shouldStripHtmlTags: true)
            genres
            language
            authorName
          }
        }
      }`,
      variables: {
        uuids,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getTopChartsByCountry = async ({
  type,
  country,
  page,
  limitPerPage,
}: {
  type?: keyof typeof TaddyType;
  country?: keyof typeof Country;
  page?: number;
  limitPerPage?: number;
}) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<{ podcastSeries: PodcastSeries[]; podcastEpisodes: PodcastEpisode[], topchartsId: string }>
    >("", {
      query: `query($type: TaddyType!, $country: Country!, $page: Int, $limitPerPage: Int) {
        getTopChartsByCountry(taddyType: $type, country: $country, page: $page, limitPerPage: $limitPerPage){
          topChartsId
          podcastSeries{
            uuid
            name
            language
            genres
            description(shouldStripHtmlTags: true)
            datePublished
            imageUrl
            websiteUrl
            authorName
          }
          podcastEpisodes{
            uuid
            name
            subtitle
            duration
            description(shouldStripHtmlTags: true)
            datePublished
            audioUrl
            imageUrl
            websiteUrl
            podcastSeries{
              uuid
              name
              language
              genres
              description(shouldStripHtmlTags: true)
              datePublished
              imageUrl
              authorName
              websiteUrl
            }
          }
        }
      }`,
      variables: {
        type,
        country,
        page,
        limitPerPage,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getTopChartsByGenres = async ({
  type,
  genres,
  country,
  page,
  limitPerPage,
}: {
  type: keyof typeof TaddyType;
  genres?: (keyof typeof Genre)[];
  country?: keyof typeof Country;
  page?: number;
  limitPerPage?: number;
}) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<{ podcastSeries: PodcastSeries[]; podcastEpisodes: PodcastEpisode[], topchartsId: string }>
    >("", {
      query: `query($type: TaddyType!, $genres: [Genre!], $country: Country, $page: Int, $limitPerPage: Int) {
        getTopChartsByGenres(taddyType: $type, genres: $genres, filterByCountry: $country, page: $page, limitPerPage: $limitPerPage){
          topChartsId
          podcastSeries{
            uuid
            name
            language
            genres
            description(shouldStripHtmlTags: true)
            datePublished
            imageUrl
            websiteUrl
            authorName
          }
          podcastEpisodes{
            uuid
            name
            subtitle
            duration
            description(shouldStripHtmlTags: true)
            datePublished
            audioUrl
            imageUrl
            websiteUrl
            podcastSeries{
              uuid
              name
              language
              genres
              description(shouldStripHtmlTags: true)
              datePublished
              imageUrl
              websiteUrl
              authorName
            }
          }
        }
      }`,
      variables: {
        type,
        genres,
        country,
        page,
        limitPerPage,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const getPopularContent = async ({
  language,
  genres,
  page,
  limitPerPage,
}: {
  language?: keyof typeof Language;
  genres?: keyof (typeof Genre)[];
  page?: number;
  limitPerPage?: number;
}) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<
      TaddyPodcastsResponse<{ podcastSeries: PodcastSeries[] }>
    >("", {
      query: `query($language: Language, $genres: [Genre], $page: Int, $limitPerPage: Int) {
        getPopularContent(filterByLanguage: $language, filterByGenres: $genres, page: $page, limitPerPage: $limitPerPage){
          popularityRankId
          podcastSeries{
            uuid
            language
            genres
            name
            description
            popularityRank
            authorName
          }
        }
      }`,
      variables: {
        language,
        genres,
        page,
        limitPerPage,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
};

export const search = async ({
  searchTerm,
  page,
  limitPerPage,
  filterForTypes,
  filterForCountries,
  filterForLanguages,
  filterForGenres,
  filterForSeriesUuids,
  filterForNotInSeriesUuids,
  filterForPodcastContentType,
  filterForPublishedAfter,
  filterForPublishedBefore,
  filterForLastUpdatedAfter,
  filterForLastUpdatedBefore,
  filterForTotalEpisodesLessThan,
  filterForTotalEpisodesGreaterThan,
  filterForDurationLessThan,
  filterForDurationGreaterThan,
  filterForHasTranscript,
  sortBy,
  matchBy,
  isSafeMode,
}: {
  searchTerm: string;
  page?: number;
  limitPerPage?: number;
  filterForTypes?: (keyof typeof SearchContentType)[];
  filterForCountries?: (keyof typeof Country)[];
  filterForLanguages?: (keyof typeof Language)[];
  filterForGenres?: (keyof typeof Genre)[];
  filterForSeriesUuids?: string[];
  filterForNotInSeriesUuids?: string[];
  filterForPodcastContentType?: (keyof typeof PodcastContentType)[];
  filterForPublishedAfter?: number;
  filterForPublishedBefore?: number;
  filterForLastUpdatedAfter?: number;
  filterForLastUpdatedBefore?: number;
  filterForTotalEpisodesLessThan?: number;
  filterForTotalEpisodesGreaterThan?: number;
  filterForDurationLessThan?: number;
  filterForDurationGreaterThan?: number;
  filterForHasTranscript?: boolean;
  sortBy?: keyof typeof SearchSortOrder;
  matchBy?: keyof typeof SearchMatchType;
  isSafeMode?: boolean;
}) => {
  try {
    const rsp = await taddyPodcastsApiInstance.post<TaddyPodcastsResponse<{ searchId: string; podcastSeries: PodcastSeries[]; podcastEpisodes: PodcastEpisode[]; rankingDetails: SearchRankingDetails[]; responseDetails: SearchResponseDetails[] }>>("", {
      query: `query($term: String, $page: Int, $limitPerPage: Int, $filterForTypes: [SearchContentType], $filterForCountries: [Country], $filterForLanguages: [Language], $filterForGenres: [Genre], $filterForSeriesUuids: [ID], $filterForNotInSeriesUuids: [ID], $filterForPodcastContentType: [PodcastContentType], $filterForPublishedAfter: Int, $filterForPublishedBefore: Int, $filterForLastUpdatedAfter: Int, $filterForLastUpdatedBefore: Int, $filterForTotalEpisodesLessThan: Int, $filterForTotalEpisodesGreaterThan: Int, $filterForDurationLessThan: Int, $filterForDurationGreaterThan: Int, $filterForHasTranscript: Boolean, $sortBy: SearchSortOrder, $matchBy: SearchMatchType, $isSafeMode: Boolean){
        search(term: $term, page: $page, limitPerPage: $limitPerPage, filterForTypes: $filterForTypes, filterForCountries: $filterForCountries, filterForLanguages: $filterForLanguages, filterForGenres: $filterForGenres, filterForSeriesUuids: $filterForSeriesUuids, filterForNotInSeriesUuids: $filterForNotInSeriesUuids, filterForPodcastContentType: $filterForPodcastContentType, filterForPublishedAfter: $filterForPublishedAfter, filterForPublishedBefore: $filterForPublishedBefore, filterForLastUpdatedAfter: $filterForLastUpdatedAfter, filterForLastUpdatedBefore: $filterForLastUpdatedBefore, filterForTotalEpisodesLessThan: $filterForTotalEpisodesLessThan, filterForTotalEpisodesGreaterThan: $filterForTotalEpisodesGreaterThan, filterForDurationLessThan: $filterForDurationLessThan, filterForDurationGreaterThan: $filterForDurationGreaterThan, filterForHasTranscript: $filterForHasTranscript, sortBy: $sortBy, matchBy: $matchBy, isSafeMode: $isSafeMode){
          searchId
          podcastSeries{
            uuid
            name
            language
            genres
            description(shouldStripHtmlTags: true)
            datePublished
            imageUrl
            websiteUrl
            authorName
          }
          podcastEpisodes{
            uuid
            name
            subtitle
            duration
            description(shouldStripHtmlTags: true)
            datePublished
            audioUrl
            imageUrl
            websiteUrl
            podcastSeries{
              uuid
              name
              imageUrl
              description(shouldStripHtmlTags: true)
              genres
              language
              authorName
            }
          }
          rankingDetails{
            id
            uuid
            rankingScore
          }
          responseDetails{
            id
            type
            totalCount
            pagesCount
          }
        }
      }`,
      variables: {
        term: searchTerm,
        page,
        limitPerPage,
        filterForTypes,
        filterForCountries,
        filterForLanguages,
        filterForGenres,
        filterForSeriesUuids,
        filterForNotInSeriesUuids,
        filterForPodcastContentType,
        filterForPublishedAfter,
        filterForPublishedBefore,
        filterForLastUpdatedAfter,
        filterForLastUpdatedBefore,
        filterForTotalEpisodesLessThan,
        filterForTotalEpisodesGreaterThan,
        filterForDurationLessThan,
        filterForDurationGreaterThan,
        filterForHasTranscript,
        sortBy,
        matchBy,
        isSafeMode,
      },
    });
    if (rsp.data?.data?.errors) {
      throw rsp.data?.data?.errors;
    }
    return rsp.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw error;
    }
    throw error;
  }
}
