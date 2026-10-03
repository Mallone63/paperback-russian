import {
    SourceManga,
    Chapter,
    ChapterDetails,
    HomeSection,
    SearchRequest,
    PagedResults,
    SourceInfo,
    BadgeColor,
    TagSection,
    ContentRating,
    MangaUpdates,
    ChapterProviding,
    MangaProviding,
    SearchResultsProviding,
    HomePageSectionsProviding,
    HomeSectionType,
    Request,
    Response,
    PartialSourceManga
} from '@paperback/types'

import * as cheerio from 'cheerio'
import { CheerioAPI } from 'cheerio'

import { Parser } from './Parser'

const ReadManga_DOMAIN = 'https://a.zazaza.me'
const AdultManga_DOMAIN = 'https://1.seimanga.me'
const SEARCH_PAGE_SIZE = 70

export const ReadMangaInfo: SourceInfo = {
    version: '1.2.1',
    name: 'ReadManga',
    description: 'Extension that pulls manga from readmanga.live and seimanga.me',
    author: 'mallone63',
    authorWebsite: 'https://github.com/mallone63',
    icon: 'logo.png',
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: ReadManga_DOMAIN,
    sourceTags: [
        {
            text: 'Russian',
            type: BadgeColor.GREY
        }
    ]
}

export class ReadManga implements SearchResultsProviding, MangaProviding, ChapterProviding, HomePageSectionsProviding {

    requestManager = App.createRequestManager({
        requestsPerSecond: 2,
        requestTimeout: 30000,
    })

    baseUrl: string = ReadManga_DOMAIN
    userAgent: string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:77.0) Gecko/20100101 Firefox/78.0'
    parser = new Parser()

    getMangaShareUrl(mangaId: string): string {
        return `${ReadManga_DOMAIN}/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const $ = await this.fetchMangaPage(mangaId)
        return this.parser.parseMangaDetails($, mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        const $ = await this.fetchMangaPage(mangaId)
        return this.parser.parseChapterList($, mangaId)
    }

    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        const sources = [
            { domain: ReadManga_DOMAIN, path: `/${mangaId}/${chapterId}` },
            { domain: AdultManga_DOMAIN, path: `/${mangaId}/${chapterId}` },
            { domain: AdultManga_DOMAIN, path: `/${chapterId}` }
        ]
        let pages: string[] = []
        for (const source of sources) {
            const request = App.createRequest({
                url: `${source.domain}${source.path}`,
                method: 'GET',
                headers: this.constructHeaders({}, '', source.domain),
                param: '?mtr=1'
            })
            const data = await this.requestManager.schedule(request, 1)
            const $ = cheerio.load(data.data ?? '')
            pages = this.parser.parseChapterDetails($, source.domain)
            if (pages.length > 0) break
        }

        return App.createChapterDetails({
            id: chapterId,
            mangaId,
            pages
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1

        const readMangaRequest = this.constructSearchRequest(query, ReadManga_DOMAIN, page)
        const adultMangaRequest = this.constructSearchRequest(query, AdultManga_DOMAIN, page)

        try {
            // Execute both requests in parallel
            const [readMangaData, adultMangaData] = await Promise.all([
                this.requestManager.schedule(readMangaRequest, 1),
                this.requestManager.schedule(adultMangaRequest, 1)
            ])

            let $readManga: CheerioAPI | undefined
            if (readMangaData.data) {
                $readManga = cheerio.load(readMangaData.data)
            }
            let $adultManga: CheerioAPI | undefined
            if (adultMangaData.data) {
                $adultManga = cheerio.load(adultMangaData.data)
            }

            const readMangaResults = $readManga ? this.parser.parseSearchResults($readManga) : []
            const adultMangaResults = $adultManga ? this.parser.parseSearchResults($adultManga) : []

            // Combine and de-duplicate results (O(n) via a Map keyed by mangaId)
            const unique = new Map<string, PartialSourceManga>()
            for (const manga of [...readMangaResults, ...adultMangaResults]) {
                if (!unique.has(manga.mangaId)) {
                    unique.set(manga.mangaId, manga)
                }
            }
            const allManga = [...unique.values()]

            // Pagination is driven by the primary (ReadManga) source
            let mData
            if ($readManga && !this.parser.isLastPage($readManga)) {
                mData = { page: page + 1 }
            }

            return App.createPagedResults({
                results: allManga,
                metadata: mData
            })
        } catch (error) {
            console.error('Error during search:', error)
            return App.createPagedResults({ results: [], metadata: undefined })
        }
    }

    async getSearchTags(): Promise<TagSection[]> {
        const tagsIdRequest = App.createRequest({
            url: `${ReadManga_DOMAIN}/search/advanced`,
            method: 'GET',
            headers: this.constructHeaders({}, '', ReadManga_DOMAIN)
        })
        const searchData = await this.requestManager.schedule(tagsIdRequest, 1)
        const $ = cheerio.load(searchData.data ?? '')
        return this.parser.parseTags($)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sections = [
            {
                request: App.createRequest({
                    url: `${ReadManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}, '', ReadManga_DOMAIN),
                    param: '?sortType=votes'
                }),
                section: App.createHomeSection({
                    id: '0',
                    title: 'С наивысшим рейтингом',
                    type: HomeSectionType.featured,
                    containsMoreItems: true
                }),
            },
            {
                request: App.createRequest({
                    url: `${ReadManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}, '', ReadManga_DOMAIN),
                    param: '?sortType=created'
                }),
                section: App.createHomeSection({
                    id: '1',
                    title: 'Новинки',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                }),
            },
            {
                request: App.createRequest({
                    url: `${AdultManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}, '', AdultManga_DOMAIN),
                    param: '?sortType=rate'
                }),
                section: App.createHomeSection({
                    id: '2',
                    title: 'Манга для взрослых',
                    type: HomeSectionType.singleRowNormal,
                    containsMoreItems: true
                }),
            },
        ]

        const promises: Promise<void>[] = []

        for (const section of sections) {
            // Let the app load empty sections first
            sectionCallback(section.section)

            // Get the section data
            promises.push(
                this.requestManager.schedule(section.request, 1).then(response => {
                    const $ = cheerio.load(response.data ?? '')
                    section.section.items = this.parser.parseSearchResults($)
                    sectionCallback(section.section)
                }),
            )
        }

        await Promise.all(promises)
    }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const offset: number = metadata?.page ?? 0
        let url = ''
        let domain = ReadManga_DOMAIN
        switch (homepageSectionId) {
            case '1': {
                url = `${ReadManga_DOMAIN}/list?sortType=created&offset=${offset}`
                break
            }
            case '0': {
                url = `${ReadManga_DOMAIN}/list?sortType=votes&offset=${offset}`
                break
            }
            case '2': {
                url = `${AdultManga_DOMAIN}/list?sortType=rate&offset=${offset}`
                domain = AdultManga_DOMAIN
                break
            }
            default:
                return App.createPagedResults({ results: [], metadata: undefined })
        }

        const request = App.createRequest({
            url,
            method: 'GET',
            headers: this.constructHeaders({}, '', domain)
        })
        const data = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(data.data ?? '')
        const manga = this.parser.parseSearchResults($)

        let mData
        if (!this.parser.isLastPage($)) {
            mData = { page: offset + SEARCH_PAGE_SIZE }
        } else {
            mData = undefined
        }

        return App.createPagedResults({
            results: manga,
            metadata: mData
        })
    }

    async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {
        const collectedIds: string[] = []
        for (const id of ids) {
            try {
                const $ = await this.fetchMangaPage(id)
                if (this.parser.parseUpdatedManga($, time, id) != null) {
                    collectedIds.push(id)
                }
            } catch {
                // Skip ids that could not be fetched from either source
            }
        }
        mangaUpdatesFoundCallback(App.createMangaUpdates({
            ids: collectedIds
        }))
    }

    private async fetchMangaPage(mangaId: string): Promise<CheerioAPI> {
        let data: Response | undefined
        for (const domain of [ReadManga_DOMAIN, AdultManga_DOMAIN]) {
            try {
                const request = App.createRequest({
                    url: `${domain}/${mangaId}`,
                    method: 'GET',
                    headers: this.constructHeaders({}, '', domain),
                    param: '?mtr=1'
                })
                data = await this.requestManager.schedule(request, 1)
                if (data.status !== 404) break
            } catch {
                data = undefined
            }
        }
        return cheerio.load(data?.data ?? '')
    }

    private constructSearchRequest(searchQuery: SearchRequest, domain: string, page: number): Request {
        const currentYear = new Date().getFullYear()
        const offset = (page - 1) * SEARCH_PAGE_SIZE
        let params = `?offset=${offset}&years=1950,${currentYear}&sortType=RATING`
        params += searchQuery.title ? `&q=${encodeURIComponent(searchQuery.title)}` : '&q='
        for (const tag of searchQuery.includedTags) {
            params += `&${encodeURIComponent(tag.id)}=in`
        }
        return App.createRequest({
            url: `${domain}/search/advancedResults`,
            method: 'GET',
            headers: this.constructHeaders({}, '', domain),
            param: params
        })
    }

    private constructHeaders(headers: Record<string, string> = {}, refererPath = '', domain = this.baseUrl): Record<string, string> {
        headers['user-agent'] = this.userAgent
        headers['referer'] = `${domain}${refererPath}`
        headers['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
        headers['accept-language'] = 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
        return headers
    }
}
