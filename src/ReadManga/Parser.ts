import moment from 'moment'
import { Chapter, LanguageCode, Manga, MangaStatus, MangaTile, Tag, TagSection } from 'paperback-extensions-common'

const READMANGA_DOMAIN = 'https://web.usagi.one/'

export class Parser {

    parseMangaDetails($: CheerioSelector, mangaId: string): Manga {

        let rawTitles = [$('h1 > span.name').text(), $('span.name')?.first().text()]
        let titles = rawTitles.map(t => decodeURIComponent(t))
        let imageContainer = $('div.picture-fotorama')
        let image = $('img', imageContainer).attr('src') ?? ''

        let status = MangaStatus.ONGOING, author = '', released, rating: number = 0, artist = '', views, summary

        let tagArray0: Tag[] = []
        let authorArray = ($('span.elem_author > a').length === 0 ?
            $('span.elem_screenwriter > a') : $('span.elem_author > a')).toArray().forEach(element => {
                author = author.concat($(element).text(), ' ')
            })
        let artistArray = ($('span.elem_artist > a').length === 0 ?
            $('span.elem_illustrator > a') : $('span.elem_artist > a')).toArray().forEach(element => {
                artist = artist.concat($(element).text(), ' ')
            })
        if (artist === '') artist = author
        summary = $("#tab-description > div").text()
        released = $('span.elem_year > a').text()
        let timeArray = $('td.date').toArray()

        // Используем moment для парсинга даты, как в parseChapterList
        let dateStr = $(timeArray[0]).attr('data-date') || released
        let updateTime = moment(dateStr, 'DD.MM.YY').isValid() ? 
            moment(dateStr, 'DD.MM.YY').toDate() : 
            new Date(released || Date.now())

        status = $('p', 'div.subject-meta')?.first().text().includes('завершено') ? MangaStatus.COMPLETED : MangaStatus.ONGOING
        views = 0

        // let genres = $('span.elem_genre').toArray().slice(1)
        // for (let obj of genres) {
        //     let id = $(obj).text().replace(',', '').trim()
        //     let label = $(obj).text().replace(',', '').trim()
        //     if (typeof id === 'undefined' || typeof label === 'undefined') continue
        //     tagArray0 = [...tagArray0, createTag({ id: id, label: label })]
        // }
        // let tagSections: TagSection[] = [createTagSection({ id: '0', label: 'Теги', tags: tagArray0 })]
        return {
            titles: titles,
            image: image,
            status: status,
            author: author.trim(),
            artist: artist.trim(),
            views: views,
            // tags: tagSections,
            desc: this.decodeHTMLEntity(summary ?? ''),
            lastUpdate: updateTime
        }
    }


    parseChapterList($: CheerioSelector, mangaId: string): Chapter[] {

        let chapters: Chapter[] = []

        let chapArray = $('a.cp-l').toArray().reverse()
        let timeArray = $('td.date').toArray().reverse()
        for (let i = 0; i < chapArray.length; i++) {
            let obj = chapArray[i]
            let chapterId = $(obj)?.attr('href')?.replace(`/${mangaId}/`, '')
            let chapNum = i + 1
            let chapName = $(obj)?.text().trim()
            let time = moment($(timeArray[i]).attr('data-date'), 'DD.MM.YY')
            if (typeof chapterId === 'undefined' || isNaN(chapNum) || !time) continue
            chapters.push({
                id: chapterId,
                mangaId: mangaId,
                chapNum: Number(chapNum),
                langCode: LanguageCode.RUSSIAN,
                name: chapName,
                time: time.toDate()
            })
        }
        return chapters
    }





    parseChapterDetails($: CheerioSelector): string[] {
        const scripts = $('script').toArray();
        
        for (const script of scripts) {
            if (!script.children.length || !script.children[0].data) continue;
            
            const scriptContent = script.children[0].data;
            if (!scriptContent.includes('rm_h.readerInit(')) continue;

            return this.extractPagesOptimized(scriptContent);
        }
        
        return [];
    }

    private extractPagesOptimized(scriptContent: string): string[] {
        try {
            const pageRegex = /\[\'(https[^\']+)\'/g;
            const pages: string[] = [];
            let match;
            
            while ((match = pageRegex.exec(scriptContent)) !== null) {
                let pageUrl = match[1].replace(/\',\'\',"?/, '');
                
                if (!pageUrl.includes('rmr.rocks')) {
                    pageUrl = pageUrl.replace(/\?.*$/g, '');
                }
                
                if (!pageUrl.includes('auto/15/49/36') && pageUrl.startsWith('https')) {
                    pages.push(pageUrl);
                }
            }
            
            return pages;
        } catch (error) {
            console.error('Failed to extract pages:', error);
            return [];
        }
    }


    parseSearchResults($: CheerioSelector, cheerio: any): any {
        let mangaTiles: MangaTile[] = []
        let collectedIds: string[] = []

        let directManga = $('div.tile')
        let descArray = $('h3', directManga).toArray()
        let imgArray = $('img.lazy.img-fluid', directManga).toArray()

        let index = 0
        for (let obj of descArray) {
            let titleText = $('a', $(obj)).text()
            let id = $('a', $(obj)).attr('href')?.replace('/', '')
            let image = imgArray[index]?.attribs['data-original']
            index++
            if (!titleText || !id || !image) {
                continue
            }
            if (typeof id === 'undefined' || id.includes('/person/')) continue
            if (!collectedIds.includes(id)) {
                mangaTiles.push({
                    id: id,
                    title: { text: titleText },
                    image: image
                })
                collectedIds.push(id)
            }
        }
        return mangaTiles
    }


    parseUpdatedManga($: CheerioSelector, cheerio: any, time: Date, id: string): any {
        let timeArray = $('td.date').toArray()

        
        let updateTime = moment($(timeArray[0]).attr('data-date'), 'DD.MM.YY')
        
        let lastUpdatedTime = moment(time)
        if (lastUpdatedTime.isBefore(updateTime))
            return id
        return null
    }


    getTagsNames($: CheerioSelector): string[] {

        const genres: string[] = []
        for (const obj of $('a', $('td')).toArray()) {
            const label = $(obj).text().trim() ?? ''
            if (!label) continue
            genres.push(label)
        }
        return genres
    }

    parseTags($: CheerioSelector): TagSection[] {

        const genres: Tag[] = []
        let idArray = $('li > input').toArray()
        let labelArray = $('label > span').toArray()
        labelArray.forEach((obj, index) => {
            const label = $(obj).attr('title')?.trim()
            if (label) {
                let id = $(idArray[index]).attr('id')?.trim()
                if (id)
                    genres.push({ label, id })
            }
        })
        return [{ id: '0', label: 'Теги', tags: genres }]
    }

    parseHomePageSection($: CheerioSelector, cheerio: any): MangaTile[] {

        let tiles: MangaTile[] = []
        let collectedIds: string[] = []
        for (let obj of $('tr', $('.listing')).toArray()) {

            let titleText = this.decodeHTMLEntity($('a', $(obj)).first().text().replace('\n', '').trim())
            let id = $('a', $(obj)).attr('href')?.replace('/Comic/', '')
            if (!titleText || !id) {
                continue

            }
            //Tooltip Selecting 
            let imageCheerio = cheerio.load($('td', $(obj)).first().attr('title') ?? '')
            let url = this.decodeHTMLEntity(imageCheerio('img').attr('src'))
            let image = url.includes('http') ? url : `${READMANGA_DOMAIN}${url}`

            if (typeof id === 'undefined' || typeof image === 'undefined') continue
            if (!collectedIds.includes(id)) {
                tiles.push({
                    id: id,
                    title: { text: titleText },
                    image: image
                })
                collectedIds.push(id)
            }
        }
        return tiles
    }


    isLastPage($: CheerioSelector): boolean {
        return $('i.fa.fa-arrow-right').toArray().length > 0 ? false : true
    }


    decodeHTMLEntity(str: string): string {
        return str.replace(/&#(\d+);/g, function (match, dec) {
            return String.fromCharCode(dec);
        })
    }
}