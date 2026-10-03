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
        const titles = [
            $('meta[itemprop="name"]').attr('content') ?? '',
            $('meta[itemprop="alternativeHeadline"]').attr('content') ?? ''
        ]
        const image = $('img.cr-hero-poster__img[src]').attr('src') ?? ''

        // Production status is exposed via data-production-status ("FINISHED"/"ONGOING")
        const productionStatus = $('span[data-production-status]').first().attr('data-production-status')
        const status = productionStatus === 'FINISHED' ? 'Completed' : 'Ongoing'

        const author = this.collectPersonNames($, 'Сценаристы')
        const artist = this.collectPersonNames($, 'Художники')
        const summary = $('div.cr-description__content').first().text()

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                rating: 0,
                titles,
                image,
                status,
                author,
                artist,
                desc: this.decodeHTMLEntity(summary.trim())
            })
        })
    }

    private collectPersonNames($: CheerioAPI, role: string): string {
        const names: string[] = []
        const seen = new Set<string>()
        for (const item of $('.cr-main-person-item').toArray()) {
            const roleText = $('.cr-main-person-item__role', item).first().text().trim()
            if (roleText !== role) continue
            for (const nameEl of $('.cr-main-person-item__name', item).toArray()) {
                const name = $(nameEl).text().trim()
                if (name && !seen.has(name)) {
                    seen.add(name)
                    names.push(name)
                }
            }
        }
        return names.join(', ')
    }

    parseChapterList($: CheerioAPI, mangaId: string): Chapter[] {
        const chapters: Chapter[] = []

        const chapArray = $('a.cp-l').toArray().reverse()
        const timeArray = $('td.date').toArray().reverse()

        for (let i = 0; i < chapArray.length; i++) {
            const anchor = chapArray[i]
            if (!anchor) continue
            const href = $(anchor).attr('href')
            if (!href) continue

            // chapterId is the path relative to /{mangaId}/, e.g. "vol3/197"
            const chapterId = href.replace(`/${mangaId}/`, '')
            if (!chapterId || chapterId === href) continue

            const dateNode = timeArray[i]
            if (!dateNode) continue
            const time = moment($(dateNode).attr('data-date'), 'DD.MM.YY')
            if (!time.isValid()) continue

            const name = $(anchor).text().trim()

            // The parent <td> carries data-num (chapter * 10, to support fractions)
            const dataNum = $(anchor).closest('[data-num]').attr('data-num')
            let chapNum = dataNum ? Number(dataNum) / 10 : NaN
            if (isNaN(chapNum)) {
                const lastSegment = chapterId.split('/').pop() ?? ''
                chapNum = parseFloat(lastSegment)
            }
            if (isNaN(chapNum)) {
                chapNum = i + 1
            }

            chapters.push(App.createChapter({
                id: chapterId,
                chapNum,
                langCode: 'RU',
                name: name || String(chapNum),
                time: time.toDate()
            }))
        }
        return chapters
    }

    parseChapterDetails($: CheerioAPI, domain: string): string[] {
        const pages: string[] = []
        for (const script of $('script').toArray()) {
            const scriptContent = $(script).html() ?? ''
            if (!scriptContent.includes('rm_h.readerInit(')) continue

            // Reader format: ['https://cdn/','',"path?auth",width,height,'']
            // - zazaza: absolute base + relative path
            // - seimanga: empty base + root-relative path
            const regex = /\[\'([^']*)\'\s*,\s*\'\'\s*,\s*"([^"]+)"/g
            let match: RegExpExecArray | null
            while ((match = regex.exec(scriptContent)) !== null) {
                const base = match[1]
                const rawPath = match[2]
                if (!rawPath) continue

                // Strip the signed query string (?t=...&u=0&h=...). Keeping it makes
                // DDoS-Guard return HTTP 300 for clients without a browser session,
                // so images fail to load. The unsigned path is served directly.
                const path = rawPath.replace(/\?.*$/, '')

                let url: string
                if (base) {
                    url = base + path
                } else {
                    url = domain + (path.startsWith('/') ? path : `/${path}`)
                }
                if (!pages.includes(url)) pages.push(url)
            }
            break
        }
        return pages
    }

    parseSearchResults($: CheerioAPI): PartialSourceManga[] {
        const mangaTiles: PartialSourceManga[] = []
        const collectedIds = new Set<string>()

        for (const tile of $('div.tile').toArray()) {
            const link = $('div.desc h3 > a, div.desc > a', tile).first()
            const id = (link.attr('href') ?? '').replace('/', '').trim()
            const titleText = (link.text() || link.attr('title') || '').trim()
            const image = ($('img.lazy.img-fluid', tile).attr('data-original') ?? '').replace('_p', '')

            if (!id || !titleText || !image) continue
            if (id.includes('/person/')) continue
            if (collectedIds.has(id)) continue

            collectedIds.add(id)
            mangaTiles.push(App.createPartialSourceManga({
                mangaId: id,
                title: this.decodeHTMLEntity(titleText),
                image
            }))
        }
        return mangaTiles
    }

    parseUpdatedManga($: CheerioAPI, time: Date, id: string): string | null {
        const dateAttr = $('td.date').first().attr('data-date')
        if (!dateAttr) return null

        const updateTime = moment(dateAttr, 'DD.MM.YY')
        if (!updateTime.isValid()) return null

        if (moment(time).isBefore(updateTime)) return id
        return null
    }

    parseTags($: CheerioAPI): TagSection[] {
        // Note: the advanced-search form on the current domain is rendered
        // client-side (Vue SPA), so this may return no tags.
        const genres: Tag[] = []
        const idArray = $('li > input').toArray()
        const labelArray = $('label > span').toArray()
        labelArray.forEach((obj, index) => {
            const label = $(obj).attr('title')?.trim()
            if (!label) return
            const idEl = idArray[index]
            const id = idEl ? $(idEl).attr('id')?.trim() : undefined
            if (id) genres.push(App.createTag({ label, id }))
        })
        if (genres.length === 0) return []
        return [App.createTagSection({ id: '0', label: 'Теги', tags: genres })]
    }

    isLastPage($: CheerioAPI): boolean {
        return $('i.fa.fa-arrow-right').toArray().length === 0
    }

    decodeHTMLEntity(str: string): string {
        return str.replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number(dec)))
    }
}
