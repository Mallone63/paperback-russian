import {
    Chapter,
    ChapterDetails,
    HomeSection,
    Manga,
    MangaUpdates,
    PagedResults,
    SearchRequest,
    RequestHeaders,
    Source,
    SourceInfo,
    TagSection,
    TagType,
} from "paperback-extensions-common"

import { Parser, } from './Parser'

const ReadManga_DOMAIN = 'https://readmanga.io'

export const ReadMangaInfo: SourceInfo = {
    version: '1.0.1',
    name: 'ReadManga',
    description: 'Extension that pulls manga from readmanga.io',
    author: 'mallone63',
    authorWebsite: 'https://github.com/mallone63',
    icon: "logo.png",
    hentaiSource: false,
    websiteBaseURL: ReadManga_DOMAIN,
    sourceTags: [
        {
            text: "Buggy",
            type: TagType.RED
        },
        {
            text: "Russian",
            type: TagType.GREY
        }
    ]
}

export class ReadManga extends Source {

    requestManager = createRequestManager({
        requestsPerSecond: 2,
        requestTimeout: 15000,
    })


    baseUrl: string = ReadManga_DOMAIN
    userAgentRandomizer: string = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:77.0) Gecko/20100101 Firefox/78.0${Math.floor(Math.random() * 100000)}`
    parser = new Parser()


    getMangaShareUrl(mangaId: string): string | null {
        return `${ReadManga_DOMAIN}/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {

        let request = createRequestObject({
            url: `${ReadManga_DOMAIN}/${mangaId}`,
            method: 'GET',
            headers: this.constructHeaders({})
        })
        const data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)


        return this.parser.parseMangaDetails($, mangaId)
    }


    async getChapters(mangaId: string): Promise<Chapter[]> {
        let request = createRequestObject({
            url: `${ReadManga_DOMAIN}/${mangaId}`,
            method: "GET",
            headers: this.constructHeaders({})
        })

        const data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)

        let chapters = this.parser.parseChapterList($, mangaId)

        return chapters
    }


    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        let request = createRequestObject({
            url: `${ReadManga_DOMAIN}/${mangaId}/${chapterId}`,
            method: 'GET',
            headers: this.constructHeaders({})
        })

        let data = await this.requestManager.schedule(request, 1)

        let $ = this.cheerio.load(data.data, { xmlMode: true })
        let pages = this.parser.parseChapterDetails($, `${ReadManga_DOMAIN}/${mangaId}/${chapterId}`)




        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false
        })
    }



    async searchRequest(query: SearchRequest, metadata: any,): Promise<PagedResults> {
        let page: number = metadata?.page ?? 1

        let request = this.constructSearchRequest(query.title ?? '')



        let data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)
        let manga = this.parser.parseSearchResults($, this.cheerio)
        let mData = undefined
        if (!this.parser.isLastPage($)) {
            mData = { page: (page + 1) }
        }

        return createPagedResults({
            results: manga,
            metadata: mData
        })

    }


    async getTags(): Promise<TagSection[] | null> {
        const request = createRequestObject({
            url: `${ReadManga_DOMAIN}/list/genres/sort_name`,
            method: 'GET'
        })

        const data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)

        return this.parser.parseTags($)
    }


    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {

        const sections = [
            {
                request: createRequestObject({
                    url: `${ReadManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?sortType=votes'
                }),
                section: createHomeSection({
                    id: '0',
                    title: '?? ?????????????????? ??????????????????',
                    view_more: true
                }),
            },
            {
                request: createRequestObject({
                    url: `${ReadManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?sortType=created'
                }),
                section: createHomeSection({
                    id: '1',
                    title: '??????????????',
                    view_more: true,
                }),
            },
        ]

        const promises: Promise<void>[] = []

        for (const section of sections) {
            // Let the app load empty sections
            sectionCallback(section.section)

            // Get the section data
            promises.push(
                this.requestManager.schedule(section.request, 1).then(response => {
                    const $ = this.cheerio.load(response.data)
                    section.section.items = this.parser.parseSearchResults($, this.cheerio)
                    sectionCallback(section.section)
                }),
            )
        }

        // Make sure the function completes
        await Promise.all(promises)
    }


    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults | null> {
        let webPage = ''
        let page: number = metadata?.page ?? 0
        switch (homepageSectionId) {
            case '1': {
                webPage = `/list?sortType=DATE_CREATE&offset=${page}`
                break
            }
            case '0': {
                webPage = `/list?sortType=USER_RATING&offset=${page}`
                break
            }
            default:
                return Promise.resolve(null)
        }

        let request = createRequestObject({
            url: `${ReadManga_DOMAIN}${webPage}`,
            method: 'GET',
            headers: this.constructHeaders({})
        })

        let data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)
        let manga = this.parser.parseSearchResults($, this.cheerio)
        let mData
        if (!this.parser.isLastPage($)) {
            mData = { page: (page + 70) }
        } else {
            mData = undefined  // There are no more pages to continue on to, do not provide page metadata
        }

        return createPagedResults({
            results: manga,
            metadata: mData
        })
    }


    constructHeaders(headers: any, refererPath?: string): any {
        if (this.userAgentRandomizer !== '') {
            headers["user-agent"] = this.userAgentRandomizer
        }
        headers["referer"] = `${this.baseUrl}${refererPath ?? ''}`
        headers["content-type"] = "application/x-www-form-urlencoded"
        return headers
    }

    globalRequestHeaders(): RequestHeaders {
        if (this.userAgentRandomizer !== '') {
            return {
                "referer": `${this.baseUrl}/`,
                "user-agent": this.userAgentRandomizer,
                "accept": "image/jpeg,image/png,image/*;q=0.8"
            }
        }
        else {
            return {
                "referer": `${this.baseUrl}/`,
                "accept": "image/jpeg,image/png,image/*;q=0.8"
            }
        }
    }


    constructSearchRequest(searchQuery: string): any {
        let isSearch = searchQuery != ''
        let data: any = {
            "q": `${searchQuery} : ????????????!`,
        }

        return createRequestObject({
            url: `${ReadManga_DOMAIN}/search`,
            method: 'POST',
            headers: this.constructHeaders({}),
            data: this.urlEncodeObject(data),
        })
    }




}
