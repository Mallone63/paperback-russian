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
    ContentRating,
    Tag
} from "paperback-extensions-common"

import { Parser, } from './Parser'

const ReadManga_DOMAIN = 'https://readmanga.live'
const AdultManga_DOMAIN = 'https://1.seimanga.me'

export const ReadMangaInfo: SourceInfo = {
    version: '1.0.1',
    name: 'ReadManga',
    description: 'Extension that pulls manga from readmanga.live and seimanga.me',
    author: 'mallone63',
    authorWebsite: 'https://github.com/mallone63',
    icon: "logo.png",
    contentRating: ContentRating.EVERYONE,
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
        requestTimeout: 30000,
    })


    baseUrl: string = ReadManga_DOMAIN
    userAgentRandomizer: string = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:77.0) Gecko/20100101 Firefox/78.0${Math.floor(Math.random() * 100000)}`
    parser = new Parser()


    getMangaShareUrl(mangaId: string): string {
        return `${ReadManga_DOMAIN}/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {
        let data
        let request = createRequestObject({
            url: `${ReadManga_DOMAIN}/${mangaId}`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: '?mtr=1'
        })
        data = await this.requestManager.schedule(request, 1)
        console.log('getting manga details from ' + data.request.url)
        console.log('response status ' + data.status)
        
        let $ = this.cheerio.load(data.data)


        return this.parser.parseMangaDetails($, mangaId)
    }


    async getChapters(mangaId: string): Promise<Chapter[]> {
        let request = createRequestObject({
            url: `${ReadManga_DOMAIN}/${mangaId}`,
            method: "GET",
            headers: this.constructHeaders({}),
            param: '?mtr=1'
        })
        let data
        data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)

        let chapters = this.parser.parseChapterList($, mangaId)

        return chapters
    }


    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        let sources = [`${ReadManga_DOMAIN}/${mangaId}/${chapterId}`,
            `${AdultManga_DOMAIN}/${mangaId}/${chapterId}`, `${AdultManga_DOMAIN}/${chapterId}`]
        let pages: string[] = []
        let request
        let data
        let $
        for (let source of sources) {
            request = createRequestObject({
                url: `${source}`,
                method: 'GET',
                headers: this.constructHeaders({}),
                param: '?mtr=1'
            })
            data = await this.requestManager.schedule(request, 1)
            $ = this.cheerio.load(data.data)
            pages.concat(this.parser.parseChapterDetails($))
            if (pages.length > 0) break
        }
        console.log('found pages: ' + pages.length)
        console.log(pages)

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages,
            longStrip: false
        })
    }



    async getSearchResults(query: SearchRequest, metadata: any,): Promise<PagedResults> {
        let page: number = metadata?.page ?? 1
        let domain = metadata?.nextSource ?? ReadManga_DOMAIN

        let manga: any
        let mData = undefined

        let request = this.constructSearchRequest(query, domain)

        let data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)
        manga = manga ? manga.concat(this.parser.parseSearchResults($, this.cheerio)) : this.parser.parseSearchResults($, this.cheerio)
        if (!this.parser.isLastPage($)) {
            mData = { page: (page + 1), nextSource: domain }
        } else {
            mData = undefined  // There are no more pages to continue on to, do not provide page metadata
        }
        if (mData == undefined && domain == ReadManga_DOMAIN) // Done with readmanga, now lets parse mint
            mData = { page: (page + 1), nextSource: AdultManga_DOMAIN }


        return createPagedResults({
            results: manga,
            metadata: mData
        })

    }


    async getSearchTags(): Promise<TagSection[]> {
        const tagsIdRequest = createRequestObject({
            url: `${ReadManga_DOMAIN}/search/advanced`,
            method: 'GET',
            headers: this.constructHeaders({})
        })
        const searchData = await this.requestManager.schedule(tagsIdRequest, 1)
        let $ = this.cheerio.load(searchData.data)
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
                    title: 'С наивысшим рейтингом',
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
                    title: 'Новинки',
                    view_more: true,
                }),
            },
            {
                request: createRequestObject({
                    url: `${AdultManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?sortType=rate'
                }),
                section: createHomeSection({
                    id: '2',
                    title: 'Манга доля взрослых',
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


    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
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
                return Promise.resolve({
                    results: [],
                    metadata: {}
                })
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


    async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {
        let collectedIds: string[] = []

        for (const id of ids) {
            let data
            try {
                const request = createRequestObject({
                    url: `${ReadManga_DOMAIN}/${id}`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?mtr=1'
                })
                data = await this.requestManager.schedule(request, 1)
            }
            catch(e){
                const request = createRequestObject({
                    url: `${AdultManga_DOMAIN}/${id}`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?mtr=1'
                })
                data = await this.requestManager.schedule(request, 1)
            }
            let $ = this.cheerio.load(data.data)
            if (this.parser.parseUpdatedManga($, this.cheerio, time, id) != null)
                collectedIds.push(id)
            }
        mangaUpdatesFoundCallback(createMangaUpdates({
            ids: collectedIds
        }))
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


    constructSearchRequest(searchQuery: SearchRequest, domain: string): any {
        let params = `?&offset=&years=1950,2024&sortType=RATING&__cpo=aHR0cHM6Ly9taW50bWFuZ2EubGl2ZQ`
        params += searchQuery.title? `&q=${searchQuery.title}` : `&q=`
        if (searchQuery.includedTags)
            for (const tag of searchQuery.includedTags) {
                params += `&${tag.id}=in`
            }
        console.log('search parameters ' + params)
        return createRequestObject({
            url: `${domain}/search/advancedResults`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: encodeURI(params)
        })

    }




}
