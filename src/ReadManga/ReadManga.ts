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

const ReadManga_DOMAIN = 'https://web.usagi.one'
const AdultManga_DOMAIN = 'https://1.seimanga.me'

export const ReadMangaInfo: SourceInfo = {
    version: '1.2.0',
    name: 'ReadManga',
    description: 'Extension that pulls manga from web.usagi.one and seimanga.me',
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

    // В v5 requestManager должен быть инициализирован по-другому
    requestManager: any = {
        schedule: async (request: any, retryCount: number) => {
            // Простая реализация HTTP запроса вместо устаревшего requestManager
            const response = await this.makeHttpRequest(request);
            return response;
        }
    };

    // Простая HTTP реализация для замены requestManager с улучшенной обработкой ошибок
    async makeHttpRequest(request: any): Promise<any> {
        const axios = require('axios');
        try {
            const url = request.url + (request.param || '');
            const response = await axios({
                method: request.method || 'GET',
                url: url,
                headers: request.headers || {},
                timeout: 15000, // Уменьшено с 30000 для быстрого отклика
                maxRedirects: 5,
                validateStatus: (status: number) => status < 500 // Принимаем 4xx как валидные для обработки
            });
            return {
                data: response.data,
                status: response.status
            };
        } catch (error: any) {
            return {
                data: '',
                status: error.response?.status || 500
            };
        }
    }

    // Улучшенный метод для запросов с fallback
    async smartRequest(mangaId: string, path: string = '', param: string = ''): Promise<any> {
        const urls = [
            `${ReadManga_DOMAIN}/${mangaId}${path}`,
            `${AdultManga_DOMAIN}/${mangaId}${path}`,
            `${AdultManga_DOMAIN}${path}` // для случаев когда mangaId уже включён в path
        ];

        for (const url of urls) {
            const request = {
                url: url,
                method: 'GET',
                headers: this.constructHeaders({}),
                param: param
            };

            const response = await this.requestManager.schedule(request, 1);
            
            if (response.status === 200 && response.data) {
                return response;
            }
        }

        throw new Error(`Failed to fetch data for ${mangaId}${path}`);
    }


    baseUrl: string = ReadManga_DOMAIN
    userAgentRandomizer: string = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:77.0) Gecko/20100101 Firefox/78.0${Math.floor(Math.random() * 100000)}`
    parser = new Parser()


    getMangaShareUrl(mangaId: string): string {
        return `${ReadManga_DOMAIN}/${mangaId}`
    }

    async getMangaDetails(mangaId: string): Promise<Manga> {
        try {
            const response = await this.smartRequest(mangaId, '', '?mtr=1');
            const $ = this.cheerio.load(response.data);
            return this.parser.parseMangaDetails($, mangaId);
        } catch (error) {
            throw new Error(`Failed to get manga details for ${mangaId}: ${error}`);
        }
    }


    async getChapters(mangaId: string): Promise<Chapter[]> {
        try {
            const response = await this.smartRequest(mangaId, '', '?mtr=1');
            const $ = this.cheerio.load(response.data);
            return this.parser.parseChapterList($, mangaId);
        } catch (error) {
            throw new Error(`Failed to get chapters for ${mangaId}: ${error}`);
        }
    }


    async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        try {
            const response = await this.smartRequest(mangaId, `/${chapterId}`, '?mtr=1');
            const $ = this.cheerio.load(response.data);
            const pages = this.parser.parseChapterDetails($);
            
            if (pages.length === 0) {
                throw new Error(`No pages found for chapter ${chapterId}`);
            }

            console.log('found pages: ' + pages.length);
            console.log(pages);

            return {
                id: chapterId,
                mangaId: mangaId,
                pages: pages,
                longStrip: false
            };
        } catch (error) {
            throw new Error(`Failed to get chapter details for ${mangaId}/${chapterId}: ${error}`);
        }
    }



    async getSearchResults(query: SearchRequest, metadata: any,): Promise<PagedResults> {
        let page: number = metadata?.page ?? 1
        let allManga: any[] = []
        let mData = undefined

        // Создаем запросы для обоих доменов
        const domains = [ReadManga_DOMAIN, AdultManga_DOMAIN]
        const requests = domains.map(domain => this.constructSearchRequest(query, domain))

        try {
            // Выполняем поиск по обоим доменам параллельно
            const responses = await Promise.allSettled([
                this.requestManager.schedule(requests[0], 1),
                this.requestManager.schedule(requests[1], 1)
            ])

            // Обрабатываем результаты с каждого домена
            for (let i = 0; i < responses.length; i++) {
                const response = responses[i]
                if (response.status === 'fulfilled' && response.value?.data) {
                    const $ = this.cheerio.load(response.value.data)
                    const domainResults = this.parser.parseSearchResults($, this.cheerio)
                    allManga = allManga.concat(domainResults)
                    
                    // Проверяем, есть ли еще страницы (берем за основу первый домен)
                    if (i === 0 && !this.parser.isLastPage($)) {
                        mData = { page: (page + 1) }
                    }
                }
            }
        } catch (error) {
            console.warn('Error during search:', error)
        }

        return {
            results: allManga,
            metadata: mData
        }

    }


    async getTags(): Promise<TagSection[]> {
        const tagsIdRequest = {
            url: `${ReadManga_DOMAIN}/search/advanced`,
            method: 'GET',
            headers: this.constructHeaders({})
        }
        const searchData = await this.requestManager.schedule(tagsIdRequest, 1)
        let $ = this.cheerio.load(searchData.data)
        return this.parser.parseTags($)
    }


    async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {

        const sections = [
            {
                request: {
                    url: `${ReadManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?sortType=votes'
                },
                section: {
                    id: '0',
                    title: 'С наивысшим рейтингом',
                    view_more: true,
                    items: []
                },
            },
            {
                request: {
                    url: `${ReadManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?sortType=created'
                },
                section: {
                    id: '1',
                    title: 'Новинки',
                    view_more: true,
                    items: []
                },
            },
            {
                request: {
                    url: `${AdultManga_DOMAIN}/list`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?sortType=rate'
                },
                section: {
                    id: '2',
                    title: 'Манга для взрослых',
                    view_more: true,
                    items: []
                },
            },            
        ]

        // Отправляем пустые секции сразу
        for (const section of sections) {
            sectionCallback(section.section)
        }

        // Параллельная загрузка с улучшенной обработкой ошибок
        const promises = sections.map(async (section) => {
            try {
                const response = await this.requestManager.schedule(section.request, 1);
                const $ = this.cheerio.load(response.data);
                section.section.items = this.parser.parseSearchResults($, this.cheerio);
                sectionCallback(section.section);
            } catch (error) {
                console.warn(`Failed to load section ${section.section.id}:`, error);
                // Секция остаётся пустой при ошибке
                sectionCallback(section.section);
            }
        });

        // Используем allSettled для обработки частичных ошибок
        await Promise.allSettled(promises);
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

        let request = {
            url: `${ReadManga_DOMAIN}${webPage}`,
            method: 'GET',
            headers: this.constructHeaders({})
        }

        let data = await this.requestManager.schedule(request, 1)
        let $ = this.cheerio.load(data.data)
        let manga = this.parser.parseSearchResults($, this.cheerio)
        let mData
        if (!this.parser.isLastPage($)) {
            mData = { page: (page + 70) }
        } else {
            mData = undefined  // There are no more pages to continue on to, do not provide page metadata
        }

        return {
            results: manga,
            metadata: mData
        }
    }


    async filterUpdatedManga(mangaUpdatesFoundCallback: (updates: MangaUpdates) => void, time: Date, ids: string[]): Promise<void> {
        let collectedIds: string[] = []

        for (const id of ids) {
            let data
            try {
                const request = {
                    url: `${ReadManga_DOMAIN}/${id}`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?mtr=1'
                }
                data = await this.requestManager.schedule(request, 1)
            }
            catch(e){
                const request = {
                    url: `${AdultManga_DOMAIN}/${id}`,
                    method: 'GET',
                    headers: this.constructHeaders({}),
                    param: '?mtr=1'
                }
                data = await this.requestManager.schedule(request, 1)
            }
            let $ = this.cheerio.load(data.data)
            if (this.parser.parseUpdatedManga($, this.cheerio, time, id) != null)
                collectedIds.push(id)
            }
        mangaUpdatesFoundCallback({
            ids: collectedIds
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


    constructSearchRequest(searchQuery: SearchRequest, domain: string): any {
        const currentYear = new Date().getFullYear();
        let params = `?&offset=&years=1950,${currentYear}&sortType=RATING&__cpo=aHR0cHM6Ly9taW50bWFuZ2EubGl2ZQ`
        params += searchQuery.title? `&q=${searchQuery.title}` : `&q=`
        if (searchQuery.includedTags)
            for (const tag of searchQuery.includedTags) {
                params += `&${tag.id}=in`
            }
        console.log('search parameters ' + params)
        return {
            url: `${domain}/search/advancedResults`,
            method: 'GET',
            headers: this.constructHeaders({}),
            param: encodeURI(params)
        }

    }




}
