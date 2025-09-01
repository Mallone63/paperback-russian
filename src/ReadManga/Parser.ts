import moment from 'moment'
import {
    Chapter,
    PartialSourceManga,
    SourceManga,
    Tag,
    TagSection
} from '@paperback/types'

import { CheerioAPI } from 'cheerio'

export class Parser {

    parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga {

        let titles = [$('h1 > span.name').text(), $('span.name')?.first().text()]
        let imageContainer = $('div.picture-fotorama')
        let image = $('img', imageContainer).attr('src') ?? ''

        let status = 'Ongoing', author = '', rating: number = 0, artist = '', summary

        ($('span.elem_author > a').length === 0 ?
            $('span.elem_screenwriter > a') : $('span.elem_author > a')).toArray().forEach((element: any) => {
                author = author.concat($(element).text(), ' ')
            });
        ($('span.elem_artist > a').length === 0 ?
            $('span.elem_illustrator > a') : $('span.elem_artist > a')).toArray().forEach((element: any) => {
                artist = artist.concat($(element).text(), ' ')
            });
        if (artist === '') artist = author
        summary = $("#tab-description > div").text()

        status = $('p', 'div.subject-meta')?.first().text().includes('завершено') ? 'Completed' : 'Ongoing'


        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                rating: rating,
                titles: titles,
                image: image,
                status: status,
                author: author.trim(),
                artist: artist.trim(),
                desc: this.decodeHTMLEntity(summary ?? '')

            })
        })
    }

    parseChapterList($: CheerioAPI, mangaId: string): Chapter[] {

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
            chapters.push(App.createChapter({
                id: chapterId,
                chapNum: Number(chapNum),
                langCode: 'RU',
                name: chapName,
                time: time.toDate()
            }))
        }
        return chapters
    }

    parseChapterDetails($: CheerioAPI): string[] {
        const scripts = $('script')
        // console.log('scripts found: ', scripts.length)
        let pages: string[] = []
        for (const script of scripts.toArray()) {
            const scriptContent = $(script).html()
            if (scriptContent && scriptContent.includes('rm_h.readerInit(')) {
                const links = [...scriptContent.matchAll(/(?:\[\'(https.*?)\"\,)/ig)]
                for (const link of links) {
                    if (link[1]) {
                        // console.log(link)
                        let strippedLink = link[1].replace('\',\'\',\"', '')
                        if (!strippedLink.includes('rmr.rocks'))
                            strippedLink = strippedLink.replace(/\?.*$/g, "")
                        // console.log(strippedLink)
                        if (!strippedLink.includes('auto/15/49/36'))
                            pages.push(strippedLink)
                    }
                }
                break
            }
        }
        return pages
    }

    parseSearchResults($: CheerioAPI, cheerio: any): any {
        let mangaTiles: PartialSourceManga[] = []
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
                mangaTiles.push(App.createPartialSourceManga({
                    mangaId: id,
                    title: titleText,
                    image: image
                }))
                collectedIds.push(id)
            }
        }
        return mangaTiles
    }

    parseUpdatedManga($: CheerioAPI, cheerio: any, time: Date, id: string): any {
        let timeArray = $('td.date').toArray()


        let updateTime = moment($(timeArray[0]).attr('data-date'), 'DD.MM.YY')

        let lastUpdatedTime = moment(time)
        if (lastUpdatedTime.isBefore(updateTime))
            return id
        return null
    }

    getTagsNames($: CheerioAPI): string[] {

        const genres: string[] = []
        for (const obj of $('a', $('td')).toArray()) {
            const label = $(obj).text().trim() ?? ''
            if (!label) continue
            genres.push(label)
        }
        return genres
    }

    parseTags($: CheerioAPI): TagSection[] {

        const genres: Tag[] = []
        let idArray = $('li > input').toArray()
        let labelArray = $('label > span').toArray()
        labelArray.forEach((obj, index) => {
            const label = $(obj).attr('title')?.trim()
            if (label) {
                let id = $(idArray[index]).attr('id')?.trim()
                if (id)
                    genres.push(App.createTag({ label, id }))
            }
        })
        return [App.createTagSection({ id: '0', label: 'Теги', tags: genres })]
    }

    parseHomePageSection($: CheerioAPI, cheerio: any, domain: string): PartialSourceManga[] {

        let tiles: PartialSourceManga[] = []
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
            let image = url.includes('http') ? url : `${domain}${url}`

            if (typeof id === 'undefined' || typeof image === 'undefined') continue
            if (!collectedIds.includes(id)) {
                tiles.push(App.createPartialSourceManga({
                    mangaId: id,
                    title: titleText,
                    image: image
                }))
                collectedIds.push(id)
            }
        }
        return tiles
    }

    isLastPage($: CheerioAPI): boolean {
        return $('i.fa.fa-arrow-right').toArray().length > 0 ? false : true
    }

    decodeHTMLEntity(str: string): string {
        return str.replace(/&#(\d+);/g, function (match, dec) {
            return String.fromCharCode(dec);
        })
    }
}