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
    HomeSectionType
} from '@paperback/types'

import * as cheerio from 'cheerio'

import { Parser, } from './Parser'

const ReadManga_DOMAIN = 'https://web.usagi.one'
const AdultManga_DOMAIN = 'https://1.seimanga.me'

export const ReadMangaInfo: SourceInfo = {
    version: '1.1.40',
    name: 'ReadManga',
    description: 'Extension that pulls manga from readmanga.live and seimanga.me',
    author: 'mallone63',
    authorWebsite: 'https://github.com/mallone63',
    icon: "logo.png",
    contentRating: ContentRating.EVERYONE,
    websiteBaseURL: ReadManga_DOMAIN,
    sourceTags: [
        {
            text: "Russian",
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
    userAgentRandomizer: string = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:77.0) Gecko/20100101 Firefox/78.0${Math.floor(Math.random() * 100000)}`
    parser = new Parser()


    getMangaShareUrl(mangaId: string): string {
        return `${ReadManga_DOMAIN}/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {

        let request = App.createRequest({
            url: `${ReadManga_DOMAIN}/${mangaId}`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: '?mtr=1'
        })
        let data = await this.requestManager.schedule(request, 1)
        if (data.status === 404) {
            request = App.createRequest({
                url: `${AdultManga_DOMAIN}/${mangaId}`,
                method: 'GET',
                headers: this.constructHeaders({}),
                param: '?mtr=1'
            })
            data = await this.requestManager.schedule(request, 1)            
        }
        let $ = cheerio.load(data.data ?? '')

        return this.parser.parseMangaDetails($, mangaId)
    }

    async getChapters(mangaId: string): Promise<Chapter[]> {
        let chapters: Chapter[] = []
        let request = App.createRequest({
            url: `${ReadManga_DOMAIN}/${mangaId}`,
            method: "GET",
            headers: this.constructHeaders({}),
            param: '?mtr=1'
        })
        let data = await this.requestManager.schedule(request, 1)
        if (data.status === 404) {
            request = App.createRequest({
                url: `${AdultManga_DOMAIN}/${mangaId}`,
                method: 'GET',
                headers: this.constructHeaders({}),
                param: '?mtr=1'
            })
            data = await this.requestManager.schedule(request, 1)            
        }
        let $ = cheerio.load(data.data ?? '')
        chapters = this.parser.parseChapterList($, mangaId)

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
            request = App.createRequest({
                url: `${source}`,
                method: 'GET',
                headers: this.constructHeaders({}),
                param: '?mtr=1'
            })
            data = await this.requestManager.schedule(request, 1)
            $ = cheerio.load(data.data ?? '')
            pages = this.parser.parseChapterDetails($)
            if (pages.length > 0) break
        }

        console.log('found pages: ' + pages.length)

        return App.createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages
        })
    }

    async getSearchResults(query: SearchRequest, metadata: any,): Promise<PagedResults> {
        let page: number = metadata?.page ?? 1
        let allManga: any[] = []
        let mData = undefined

        // Search both sources simultaneously
        const readMangaRequest = this.constructSearchRequest(query, ReadManga_DOMAIN)
        const adultMangaRequest = this.constructSearchRequest(query, AdultManga_DOMAIN)

        try {
            // Execute both requests in parallel
            const [readMangaData, adultMangaData] = await Promise.all([
                this.requestManager.schedule(readMangaRequest, 1),
                this.requestManager.schedule(adultMangaRequest, 1)
            ])

            // Parse results from ReadManga
            let readMangaResults: any[] = []
            if (readMangaData.data) {
                let $readManga = cheerio.load(readMangaData.data)
                readMangaResults = this.parser.parseSearchResults($readManga, cheerio)
            }

            // Parse results from AdultManga
            let adultMangaResults: any[] = []
            if (adultMangaData.data) {
                let $adultManga = cheerio.load(adultMangaData.data)
                adultMangaResults = this.parser.parseSearchResults($adultManga, cheerio)
            }

            // Combine results from both sources
            allManga = [...readMangaResults, ...adultMangaResults]

            // Remove duplicates based on mangaId
            const uniqueManga = allManga.filter((manga, index, self) => 
                index === self.findIndex(m => m.mangaId === manga.mangaId)
            )

            allManga = uniqueManga

            // Check if there are more pages (we'll use ReadManga as reference for pagination)
            if (readMangaData.data) {
                let $readManga = cheerio.load(readMangaData.data)
                if (!this.parser.isLastPage($readManga)) {
                    mData = { page: (page + 1) }
                }
            }

        } catch (error) {
            console.error('Error during search:', error)
            // Fallback to empty results if both requests fail
            allManga = []
        }

        return App.createPagedResults({
            results: allManga,
            metadata: mData
        })
    }

    async getSearchTags(): Promise<TagSection[]> {
        const tagsIdRequest = App.createRequest({
            url: `${ReadManga_DOMAIN}/search/advanced`,
            method: 'GET',
            headers: this.constructHeaders({})
        })
        const searchData = await this.requestManager.schedule(tagsIdRequest, 1)
        let $ = cheerio.load(searchData.data ?? '')
        return this.parser.parseTags($)
    }

    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {

        const sections = [
            {
                request: App.createRequest({
                    url: `${ReadManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
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
                    headers: this.constructHeaders({}),
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
                    headers: this.constructHeaders({}),
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
            // Let the app load empty sections
            sectionCallback(section.section)

            // Get the section data
            promises.push(
                this.requestManager.schedule(section.request, 1).then(response => {
                    const $ = cheerio.load(response.data ?? '')
                    section.section.items = this.parser.parseSearchResults($, cheerio)
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

        let request = App.createRequest({
            url: `${ReadManga_DOMAIN}${webPage}`,
            method: 'GET',
            headers: this.constructHeaders({})
        })

        let data = await this.requestManager.schedule(request, 1)
        let $ = cheerio.load(data.data ?? '')
        let manga = this.parser.parseSearchResults($, cheerio)
        let mData
        if (!this.parser.isLastPage($)) {
            mData = { page: (page + 70) }
        } else {
            mData = undefined  // There are no more pages to continue on to, do not provide page metadata
        }

        return App.createPagedResults({
            results: manga,
            metadata: mData
        })
    }

    async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {
        const collectedIds: string[] = []
        let data
        for (const id of ids) {
            try {
                const request = App.createRequest({
                    url: `${ReadManga_DOMAIN}/${id}`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?mtr=1'
                })
                data = await this.requestManager.schedule(request, 1)
            }
            catch(e){
                const request = App.createRequest({
                    url: `${AdultManga_DOMAIN}/${id}`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?mtr=1'
                })
                data = await this.requestManager.schedule(request, 1)
            }
            let $ = cheerio.load(data.data ?? '')
            if (this.parser.parseUpdatedManga($, cheerio, time, id) != null)
                collectedIds.push(id)
        }
        mangaUpdatesFoundCallback(App.createMangaUpdates({
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

    constructSearchRequest(searchQuery: SearchRequest, domain: string): any {
        const currentYear = new Date().getFullYear();
        let params = `?&offset=&years=1950,${currentYear}&sortType=RATING&__cpo=aHR0cHM6Ly9taW50bWFuZ2EubGl2ZQ`
        params += searchQuery.title? `&q=${searchQuery.title}` : `&q=`
        if (searchQuery.includedTags)
            for (const tag of searchQuery.includedTags) {
                params += `&${tag.id}=in`
            }
        console.log('search parameters ' + params)
        return App.createRequest({
            url: `${domain}/search/advancedResults`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: encodeURI(params)
        })

    }
}
