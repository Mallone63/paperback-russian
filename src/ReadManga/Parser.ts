import moment from 'moment'
import { Chapter, LanguageCode, Manga, MangaStatus, MangaTile, Tag, TagSection } from 'paperback-extensions-common'

const READMANGA_DOMAIN = 'https://readmanga.live/'

export class Parser {

    parseMangaDetails($: CheerioSelector, mangaId: string): Manga {

        let titles = [$('span.name').text(), $('span.eng-name').text()]
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

        status = $('p', 'div.subject-meta')?.first().text().includes('завершено') ? MangaStatus.COMPLETED : MangaStatus.ONGOING
        views = 0

        let genres = $('span.elem_genre').toArray().slice(1)
        for (let obj of genres) {
            let id = $(obj).text().replace(',', '').trim()
            let label = $(obj).text().replace(',', '').trim()
            if (typeof id === 'undefined' || typeof label === 'undefined') continue
            tagArray0 = [...tagArray0, createTag({ id: id, label: label })]
        }
        let tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: tagArray0 })]
        return createManga({
            id: mangaId,
            rating: rating,
            titles: titles,
            image: image,
            status: status,
            author: author.trim(),
            artist: artist.trim(),
            views: views,
            tags: tagSections,
            desc: this.decodeHTMLEntity(summary ?? ''),
            lastUpdate: released
        })
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
            chapters.push(createChapter({
                id: chapterId,
                mangaId: mangaId,
                chapNum: Number(chapNum),
                langCode: LanguageCode.RUSSIAN,
                name: chapName,
                time: time.toDate()
            }))
        }
        return chapters
    }





    parseChapterDetails($: CheerioSelector, url: string): string[] {
        let scripts = $('script').toArray()
        console.log('scripts found: ', scripts.length)
        let pages = []
        for (let script of scripts) {
            if (script.children.length > 0 && script.children[0].data) {
                console.log(script.children[0].data)
                if (script.children[0].data.includes('rm_h.initReader(')) {
                    let links = [...script.children[0].data.matchAll(/(?:\[\'(https.*?)\"\,)/ig)]
                    for (let link of links) {
                        console.log(link)
                        let strippedLink = link[1].replace('\',\'\',\"', '')
                        if (!strippedLink.includes('rmr.rocks'))
                            strippedLink = strippedLink.replace(/\?.*$/g, "")
                        console.log(strippedLink)
                        pages.push(strippedLink)
                    }
                    break
                }
            }
        }
        return pages
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
                mangaTiles.push(createMangaTile({
                    id: id,
                    title: createIconText({ text: titleText }),
                    image: image
                }))
                collectedIds.push(id)
            }
        }
        return mangaTiles
    }


    parseUpdatedManga($: CheerioSelector, cheerio: any, time: Date, ids: string[]): any {
        let collectedIds: string[] = []

        let directManga = $('div.tile')
        let descArray = $('h3', directManga).toArray()
        let timeArray = $('div.manga-updated.ribbon').toArray()

        let index = 0
        for (let obj of descArray) {
            let id = $('a', $(obj)).attr('href')?.replace('/', '')
            let updateTime = moment(timeArray[index]?.attribs['title'], 'HH:MM DD.MM')
            let lastUpdatedTime = moment(time)
            index++
            if (!id) {
                continue
            }
            if (typeof id === 'undefined' || id.includes('/person/')) continue
            if (!collectedIds.includes(id) && ids.includes(id) && updateTime.isBefore(lastUpdatedTime) ) {
                collectedIds.push(id)
            }
        }
        return collectedIds
    }


    parseTags($: CheerioSelector): TagSection[] {

        let tagSections: TagSection[] = [createTagSection({ id: '0', label: 'genres', tags: [] })]

        for (let obj of $('a', $('td')).toArray()) {
            let id = $(obj).attr('href')?.trim()
            let genre = $(obj).text().trim()
            if (!id || !genre) continue
            console.log('tag found: ' + genre)
            tagSections[0].tags.push(createTag({ id: id, label: genre }))
        }
        console.log('found tags: ' + tagSections.length)
        return tagSections
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
                tiles.push(createMangaTile({
                    id: id,
                    title: createIconText({ text: titleText }),
                    image: image
                }))
                collectedIds.push(id)
            }
        }
        return tiles
    }


    isLastPage($: CheerioSelector): boolean {
        return $('i.fa.fa-arrow-right').length > 0 ? false : true
    }


    decodeHTMLEntity(str: string): string {
        return str.replace(/&#(\d+);/g, function (match, dec) {
            return String.fromCharCode(dec);
        })
    }
}