(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Sources = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
"use strict";
/**
 * Request objects hold information for a particular source (see sources for example)
 * This allows us to to use a generic api to make the calls against any source
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Source = void 0;
class Source {
    constructor(cheerio) {
        // <-----------        OPTIONAL METHODS        -----------> //
        /**
         * Manages the ratelimits and the number of requests that can be done per second
         * This is also used to fetch pages when a chapter is downloading
         */
        this.requestManager = createRequestManager({
            requestsPerSecond: 2.5,
            requestTimeout: 5000
        });
        this.cheerio = cheerio;
    }
    /**
     * (OPTIONAL METHOD) This function is called when ANY request is made by the Paperback Application out to the internet.
     * By modifying the parameter and returning it, the user can inject any additional headers, cookies, or anything else
     * a source may need to load correctly.
     * The most common use of this function is to add headers to image requests, since you cannot directly access these requests through
     * the source implementation itself.
     *
     * NOTE: This does **NOT** influence any requests defined in the source implementation. This function will only influence requests
     * which happen behind the scenes and are not defined in your source.
     */
    globalRequestHeaders() { return {}; }
    globalRequestCookies() { return []; }
    /**
     * A stateful source may require user input.
     * By supplying this value to the Source, the app will render your form to the user
     * in the application settings.
     */
    getAppStatefulForm() { return createUserForm({ formElements: [] }); }
    /**
     * When the Advanced Search is rendered to the user, this skeleton defines what
     * fields which will show up to the user, and returned back to the source
     * when the request is made.
     */
    getAdvancedSearchForm() { return createUserForm({ formElements: [] }); }
    /**
     * (OPTIONAL METHOD) Given a manga ID, return a URL which Safari can open in a browser to display.
     * @param mangaId
     */
    getMangaShareUrl(mangaId) { return null; }
    /**
     * If a source is secured by Cloudflare, this method should be filled out.
     * By returning a request to the website, this source will attempt to create a session
     * so that the source can load correctly.
     * Usually the {@link Request} url can simply be the base URL to the source.
     */
    getCloudflareBypassRequest() { return null; }
    /**
     * (OPTIONAL METHOD) A function which communicates with a given source, and returns a list of all possible tags which the source supports.
     * These tags are generic and depend on the source. They could be genres such as 'Isekai, Action, Drama', or they can be
     * listings such as 'Completed, Ongoing'
     * These tags must be tags which can be used in the {@link searchRequest} function to augment the searching capability of the application
     */
    getTags() { return Promise.resolve(null); }
    /**
     * (OPTIONAL METHOD) A function which should scan through the latest updates section of a website, and report back with a list of IDs which have been
     * updated BEFORE the supplied timeframe.
     * This function may have to scan through multiple pages in order to discover the full list of updated manga.
     * Because of this, each batch of IDs should be returned with the mangaUpdatesFoundCallback. The IDs which have been reported for
     * one page, should not be reported again on another page, unless the relevent ID has been detected again. You do not want to persist
     * this internal list between {@link Request} calls
     * @param mangaUpdatesFoundCallback A callback which is used to report a list of manga IDs back to the API
     * @param time This function should find all manga which has been updated between the current time, and this parameter's reported time.
     *             After this time has been passed, the system should stop parsing and return
     */
    filterUpdatedManga(mangaUpdatesFoundCallback, time, ids) { return Promise.resolve(); }
    /**
     * (OPTIONAL METHOD) A function which should readonly allf the available homepage sections for a given source, and return a {@link HomeSection} object.
     * The sectionCallback is to be used for each given section on the website. This may include a 'Latest Updates' section, or a 'Hot Manga' section.
     * It is recommended that before anything else in your source, you first use this sectionCallback and send it {@link HomeSection} objects
     * which are blank, and have not had any requests done on them just yet. This way, you provide the App with the sections to render on screen,
     * which then will be populated with each additional sectionCallback method called. This is optional, but recommended.
     * @param sectionCallback A callback which is run for each independant HomeSection.
     */
    getHomePageSections(sectionCallback) { return Promise.resolve(); }
    /**
     * (OPTIONAL METHOD) This function will take a given homepageSectionId and metadata value, and with this information, should return
     * all of the manga tiles supplied for the given state of parameters. Most commonly, the metadata value will contain some sort of page information,
     * and this request will target the given page. (Incrementing the page in the response so that the next call will return relevent data)
     * @param homepageSectionId The given ID to the homepage defined in {@link getHomePageSections} which this method is to readonly moreata about
     * @param metadata This is a metadata parameter which is filled our in the {@link getHomePageSections}'s return
     * function. Afterwards, if the metadata value returned in the {@link PagedResults} has been modified, the modified version
     * will be supplied to this function instead of the origional {@link getHomePageSections}'s version.
     * This is useful for keeping track of which page a user is on, pagnating to other pages as ViewMore is called multiple times.
     */
    getViewMoreItems(homepageSectionId, metadata) { return Promise.resolve(null); }
    /**
     * (OPTIONAL METHOD) This function is to return the entire library of a manga website, page by page.
     * If there is an additional page which needs to be called, the {@link PagedResults} value should have it's metadata filled out
     * with information needed to continue pulling information from this website.
     * Note that if the metadata value of {@link PagedResults} is undefined, this method will not continue to run when the user
     * attempts to readonly morenformation
     * @param metadata Identifying information as to what the source needs to call in order to readonly theext batch of data
     * of the directory. Usually this is a page counter.
     */
    getWebsiteMangaDirectory(metadata) { return Promise.resolve(null); }
    // <-----------        PROTECTED METHODS        -----------> //
    // Many sites use '[x] time ago' - Figured it would be good to handle these cases in general
    convertTime(timeAgo) {
        var _a;
        let time;
        let trimmed = Number(((_a = /\d*/.exec(timeAgo)) !== null && _a !== void 0 ? _a : [])[0]);
        trimmed = (trimmed == 0 && timeAgo.includes('a')) ? 1 : trimmed;
        if (timeAgo.includes('minutes')) {
            time = new Date(Date.now() - trimmed * 60000);
        }
        else if (timeAgo.includes('hours')) {
            time = new Date(Date.now() - trimmed * 3600000);
        }
        else if (timeAgo.includes('days')) {
            time = new Date(Date.now() - trimmed * 86400000);
        }
        else if (timeAgo.includes('year') || timeAgo.includes('years')) {
            time = new Date(Date.now() - trimmed * 31556952000);
        }
        else {
            time = new Date(Date.now());
        }
        return time;
    }
    /**
     * When a function requires a POST body, it always should be defined as a JsonObject
     * and then passed through this function to ensure that it's encoded properly.
     * @param obj
     */
    urlEncodeObject(obj) {
        let ret = {};
        for (const entry of Object.entries(obj)) {
            ret[encodeURIComponent(entry[0])] = encodeURIComponent(entry[1]);
        }
        return ret;
    }
}
exports.Source = Source;

},{}],3:[function(require,module,exports){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./Source"), exports);

},{"./Source":2}],4:[function(require,module,exports){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./base"), exports);
__exportStar(require("./models"), exports);
__exportStar(require("./APIWrapper"), exports);

},{"./APIWrapper":1,"./base":3,"./models":25}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

},{}],6:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],7:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],8:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LanguageCode = void 0;
var LanguageCode;
(function (LanguageCode) {
    LanguageCode["UNKNOWN"] = "_unknown";
    LanguageCode["BENGALI"] = "bd";
    LanguageCode["BULGARIAN"] = "bg";
    LanguageCode["BRAZILIAN"] = "br";
    LanguageCode["CHINEESE"] = "cn";
    LanguageCode["CZECH"] = "cz";
    LanguageCode["GERMAN"] = "de";
    LanguageCode["DANISH"] = "dk";
    LanguageCode["ENGLISH"] = "gb";
    LanguageCode["SPANISH"] = "es";
    LanguageCode["FINNISH"] = "fi";
    LanguageCode["FRENCH"] = "fr";
    LanguageCode["WELSH"] = "gb";
    LanguageCode["GREEK"] = "gr";
    LanguageCode["CHINEESE_HONGKONG"] = "hk";
    LanguageCode["HUNGARIAN"] = "hu";
    LanguageCode["INDONESIAN"] = "id";
    LanguageCode["ISRELI"] = "il";
    LanguageCode["INDIAN"] = "in";
    LanguageCode["IRAN"] = "ir";
    LanguageCode["ITALIAN"] = "it";
    LanguageCode["JAPANESE"] = "jp";
    LanguageCode["KOREAN"] = "kr";
    LanguageCode["LITHUANIAN"] = "lt";
    LanguageCode["MONGOLIAN"] = "mn";
    LanguageCode["MEXIAN"] = "mx";
    LanguageCode["MALAY"] = "my";
    LanguageCode["DUTCH"] = "nl";
    LanguageCode["NORWEGIAN"] = "no";
    LanguageCode["PHILIPPINE"] = "ph";
    LanguageCode["POLISH"] = "pl";
    LanguageCode["PORTUGUESE"] = "pt";
    LanguageCode["ROMANIAN"] = "ro";
    LanguageCode["RUSSIAN"] = "ru";
    LanguageCode["SANSKRIT"] = "sa";
    LanguageCode["SAMI"] = "si";
    LanguageCode["THAI"] = "th";
    LanguageCode["TURKISH"] = "tr";
    LanguageCode["UKRAINIAN"] = "ua";
    LanguageCode["VIETNAMESE"] = "vn";
})(LanguageCode = exports.LanguageCode || (exports.LanguageCode = {}));

},{}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MangaStatus = void 0;
var MangaStatus;
(function (MangaStatus) {
    MangaStatus[MangaStatus["ONGOING"] = 1] = "ONGOING";
    MangaStatus[MangaStatus["COMPLETED"] = 0] = "COMPLETED";
})(MangaStatus = exports.MangaStatus || (exports.MangaStatus = {}));

},{}],11:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],12:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],13:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],14:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],15:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],16:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],17:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],18:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],19:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],20:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],21:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TagType = void 0;
/**
 * An enumerator which {@link SourceTags} uses to define the color of the tag rendered on the website.
 * Five types are available: blue, green, grey, yellow and red, the default one is blue.
 * Common colors are red for (Broken), yellow for (+18), grey for (Country-Proof)
 */
var TagType;
(function (TagType) {
    TagType["BLUE"] = "default";
    TagType["GREEN"] = "success";
    TagType["GREY"] = "info";
    TagType["YELLOW"] = "warning";
    TagType["RED"] = "danger";
})(TagType = exports.TagType || (exports.TagType = {}));

},{}],22:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],23:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],24:[function(require,module,exports){
arguments[4][5][0].apply(exports,arguments)
},{"dup":5}],25:[function(require,module,exports){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !exports.hasOwnProperty(p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
__exportStar(require("./Chapter"), exports);
__exportStar(require("./ChapterDetails"), exports);
__exportStar(require("./HomeSection"), exports);
__exportStar(require("./Manga"), exports);
__exportStar(require("./MangaTile"), exports);
__exportStar(require("./RequestObject"), exports);
__exportStar(require("./SearchRequest"), exports);
__exportStar(require("./TagSection"), exports);
__exportStar(require("./SourceTag"), exports);
__exportStar(require("./Languages"), exports);
__exportStar(require("./Constants"), exports);
__exportStar(require("./MangaUpdate"), exports);
__exportStar(require("./PagedResults"), exports);
__exportStar(require("./ResponseObject"), exports);
__exportStar(require("./RequestManager"), exports);
__exportStar(require("./RequestHeaders"), exports);
__exportStar(require("./SourceInfo"), exports);
__exportStar(require("./TrackObject"), exports);
__exportStar(require("./OAuth"), exports);
__exportStar(require("./UserForm"), exports);

},{"./Chapter":5,"./ChapterDetails":6,"./Constants":7,"./HomeSection":8,"./Languages":9,"./Manga":10,"./MangaTile":11,"./MangaUpdate":12,"./OAuth":13,"./PagedResults":14,"./RequestHeaders":15,"./RequestManager":16,"./RequestObject":17,"./ResponseObject":18,"./SearchRequest":19,"./SourceInfo":20,"./SourceTag":21,"./TagSection":22,"./TrackObject":23,"./UserForm":24}],26:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = void 0;
const paperback_extensions_common_1 = require("paperback-extensions-common");
const READMANGA_DOMAIN = 'https://readmanga.io/';
class Parser {
    parseMangaDetails($, mangaId) {
        var _a, _b, _c, _d, _e;
        let titles = [$('span.name').text(), $('span.eng-name').text()];
        let imageContainer = $('div.picture-fotorama');
        let image = (_a = $('img', imageContainer).attr('src')) !== null && _a !== void 0 ? _a : '';
        let status = paperback_extensions_common_1.MangaStatus.ONGOING, author, released, rating = 0, artist, views, summary;
        let tagArray0 = [];
        artist = (_c = (_b = $('span.elem_artist > a').text()) !== null && _b !== void 0 ? _b : $('span.elem_illustrator > a').text()) !== null && _c !== void 0 ? _c : $('span.elem_author > a').text();
        author = (_d = $('span.elem_author > a').text()) !== null && _d !== void 0 ? _d : $('span.elem_screenwriter > a').text();
        summary = $("#tab-description > div").text();
        released = $('span.elem_year > a').text();
        status = ((_e = $('p', 'div.subject-meta')) === null || _e === void 0 ? void 0 : _e.first().text().includes('завершено')) ? paperback_extensions_common_1.MangaStatus.COMPLETED : paperback_extensions_common_1.MangaStatus.ONGOING;
        views = 0;
        let genres = $('span.elem_genre').toArray().slice(1);
        for (let obj of genres) {
            let id = $(obj).text().replace(',', '').trim();
            let label = $(obj).text().replace(',', '').trim();
            if (typeof id === 'undefined' || typeof label === 'undefined')
                continue;
            tagArray0 = [...tagArray0, createTag({ id: id, label: label })];
        }
        let tagSections = [createTagSection({ id: '0', label: 'genres', tags: tagArray0 })];
        return createManga({
            id: mangaId,
            rating: rating,
            titles: titles,
            image: image,
            status: status,
            author: this.decodeHTMLEntity(author !== null && author !== void 0 ? author : ''),
            artist: artist,
            views: views,
            tags: tagSections,
            desc: this.decodeHTMLEntity(summary !== null && summary !== void 0 ? summary : ''),
            lastUpdate: released
        });
    }
    parseChapterList($, mangaId) {
        var _a, _b, _c;
        let chapters = [];
        let chapArray = $('a.cp-l').toArray().reverse();
        let timeArray = $('td.date').toArray().reverse();
        for (let i = 0; i < chapArray.length; i++) {
            let obj = chapArray[i];
            let chapterId = (_b = (_a = $(obj)) === null || _a === void 0 ? void 0 : _a.attr('href')) === null || _b === void 0 ? void 0 : _b.replace(`/${mangaId}/`, '');
            let chapNum = i + 1;
            let chapName = (_c = $(obj)) === null || _c === void 0 ? void 0 : _c.text().trim();
            let time = $(timeArray[i]).attr('data-date-raw');
            if (typeof chapterId === 'undefined' || isNaN(chapNum) || !time)
                continue;
            console.log(chapterId, time, new Date(time));
            chapters.push(createChapter({
                id: chapterId,
                mangaId: mangaId,
                chapNum: Number(chapNum),
                langCode: paperback_extensions_common_1.LanguageCode.RUSSIAN,
                name: chapName,
                time: new Date(time)
            }));
        }
        return chapters;
    }
    parseChapterDetails($, url) {
        let scripts = $('script').toArray();
        let pages = [];
        for (let script of scripts) {
            if (script.children.length > 0 && script.children[0].data) {
                if (script.children[0].data.includes('rm_h.initReader')) {
                    let links = [...script.children[0].data.matchAll(/(?:\[\'(https.*?)\"\,)/ig)];
                    for (let link of links) {
                        pages.push(link[1].replace('\',\'\',\"', ''));
                    }
                    break;
                }
            }
        }
        return pages;
    }
    parseSearchResults($, cheerio) {
        var _a, _b;
        let mangaTiles = [];
        let collectedIds = [];
        let directManga = $('div.tile');
        let descArray = $('h3', directManga).toArray();
        let imgArray = $('img.lazy.img-fluid', directManga).toArray();
        let index = 0;
        for (let obj of descArray) {
            let titleText = $('a', $(obj)).text();
            let id = (_a = $('a', $(obj)).attr('href')) === null || _a === void 0 ? void 0 : _a.replace('/', '');
            let image = (_b = imgArray[index]) === null || _b === void 0 ? void 0 : _b.attribs['data-original'];
            index++;
            if (!titleText || !id || !image) {
                continue;
            }
            if (typeof id === 'undefined' || id.includes('/person/'))
                continue;
            if (!collectedIds.includes(id)) {
                mangaTiles.push(createMangaTile({
                    id: id,
                    title: createIconText({ text: titleText }),
                    image: image
                }));
                collectedIds.push(id);
            }
        }
        return mangaTiles;
    }
    parseTags($) {
        var _a;
        let tagSections = [createTagSection({ id: '0', label: 'genres', tags: [] })];
        for (let obj of $('a', $('td')).toArray()) {
            let id = (_a = $(obj).attr('href')) === null || _a === void 0 ? void 0 : _a.trim();
            let genre = $(obj).text().trim();
            if (!id || !genre)
                continue;
            tagSections[0].tags.push(createTag({ id: id, label: genre }));
        }
        return tagSections;
    }
    parseHomePageSection($, cheerio) {
        var _a, _b;
        let tiles = [];
        let collectedIds = [];
        for (let obj of $('tr', $('.listing')).toArray()) {
            let titleText = this.decodeHTMLEntity($('a', $(obj)).first().text().replace('\n', '').trim());
            let id = (_a = $('a', $(obj)).attr('href')) === null || _a === void 0 ? void 0 : _a.replace('/Comic/', '');
            if (!titleText || !id) {
                continue;
            }
            //Tooltip Selecting 
            let imageCheerio = cheerio.load((_b = $('td', $(obj)).first().attr('title')) !== null && _b !== void 0 ? _b : '');
            let url = this.decodeHTMLEntity(imageCheerio('img').attr('src'));
            let image = url.includes('http') ? url : `${READMANGA_DOMAIN}${url}`;
            if (typeof id === 'undefined' || typeof image === 'undefined')
                continue;
            if (!collectedIds.includes(id)) {
                tiles.push(createMangaTile({
                    id: id,
                    title: createIconText({ text: titleText }),
                    image: image
                }));
                collectedIds.push(id);
            }
        }
        return tiles;
    }
    isLastPage($) {
        return $('i.fa.fa-arrow-right').length > 0 ? false : true;
    }
    decodeHTMLEntity(str) {
        return str.replace(/&#(\d+);/g, function (match, dec) {
            return String.fromCharCode(dec);
        });
    }
}
exports.Parser = Parser;

},{"paperback-extensions-common":4}],27:[function(require,module,exports){
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadManga = exports.ReadMangaInfo = void 0;
const paperback_extensions_common_1 = require("paperback-extensions-common");
const Parser_1 = require("./Parser");
const ReadManga_DOMAIN = 'https://readmanga.io';
exports.ReadMangaInfo = {
    version: '1.0',
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
            type: paperback_extensions_common_1.TagType.RED
        },
        {
            text: "Russian",
            type: paperback_extensions_common_1.TagType.GREY
        }
    ]
};
class ReadManga extends paperback_extensions_common_1.Source {
    constructor() {
        super(...arguments);
        this.requestManager = createRequestManager({
            requestsPerSecond: 2,
            requestTimeout: 15000,
        });
        this.baseUrl = ReadManga_DOMAIN;
        this.userAgentRandomizer = `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:77.0) Gecko/20100101 Firefox/78.0${Math.floor(Math.random() * 100000)}`;
        this.parser = new Parser_1.Parser();
    }
    getMangaShareUrl(mangaId) {
        return `${ReadManga_DOMAIN}/${mangaId}`;
    }
    getMangaDetails(mangaId) {
        return __awaiter(this, void 0, void 0, function* () {
            let request = createRequestObject({
                url: `${ReadManga_DOMAIN}/${mangaId}`,
                method: 'GET',
                headers: this.constructHeaders({})
            });
            const data = yield this.requestManager.schedule(request, 1);
            let $ = this.cheerio.load(data.data);
            return this.parser.parseMangaDetails($, mangaId);
        });
    }
    getChapters(mangaId) {
        return __awaiter(this, void 0, void 0, function* () {
            let request = createRequestObject({
                url: `${ReadManga_DOMAIN}/${mangaId}`,
                method: "GET",
                headers: this.constructHeaders({})
            });
            const data = yield this.requestManager.schedule(request, 1);
            let $ = this.cheerio.load(data.data);
            let chapters = this.parser.parseChapterList($, mangaId);
            return chapters;
        });
    }
    getChapterDetails(mangaId, chapterId) {
        return __awaiter(this, void 0, void 0, function* () {
            let request = createRequestObject({
                url: `${ReadManga_DOMAIN}/${mangaId}/${chapterId}`,
                method: 'GET',
                headers: this.constructHeaders({})
            });
            let data = yield this.requestManager.schedule(request, 1);
            let $ = this.cheerio.load(data.data, { xmlMode: true });
            let pages = this.parser.parseChapterDetails($, `${ReadManga_DOMAIN}/${mangaId}/${chapterId}`);
            return createChapterDetails({
                id: chapterId,
                mangaId: mangaId,
                pages: pages,
                longStrip: false
            });
        });
    }
    searchRequest(query, metadata) {
        var _a, _b;
        return __awaiter(this, void 0, void 0, function* () {
            let page = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.page) !== null && _a !== void 0 ? _a : 1;
            let request = this.constructSearchRequest((_b = query.title) !== null && _b !== void 0 ? _b : '');
            let data = yield this.requestManager.schedule(request, 1);
            let $ = this.cheerio.load(data.data);
            let manga = this.parser.parseSearchResults($, this.cheerio);
            let mData = undefined;
            if (!this.parser.isLastPage($)) {
                mData = { page: (page + 1) };
            }
            return createPagedResults({
                results: manga,
                metadata: mData
            });
        });
    }
    getTags() {
        return __awaiter(this, void 0, void 0, function* () {
            const request = createRequestObject({
                url: `${ReadManga_DOMAIN}/list/genres/sort_name`,
                method: 'GET'
            });
            const data = yield this.requestManager.schedule(request, 1);
            let $ = this.cheerio.load(data.data);
            return this.parser.parseTags($);
        });
    }
    getHomePageSections(sectionCallback) {
        return __awaiter(this, void 0, void 0, function* () {
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
            ];
            const promises = [];
            for (const section of sections) {
                // Let the app load empty sections
                sectionCallback(section.section);
                // Get the section data
                promises.push(this.requestManager.schedule(section.request, 1).then(response => {
                    const $ = this.cheerio.load(response.data);
                    section.section.items = this.parser.parseSearchResults($, this.cheerio);
                    sectionCallback(section.section);
                }));
            }
            // Make sure the function completes
            yield Promise.all(promises);
        });
    }
    getViewMoreItems(homepageSectionId, metadata) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            let webPage = '';
            let page = (_a = metadata === null || metadata === void 0 ? void 0 : metadata.page) !== null && _a !== void 0 ? _a : 0;
            switch (homepageSectionId) {
                case '1': {
                    webPage = `/list?sortType=DATE_CREATE&offset=${page}`;
                    break;
                }
                case '0': {
                    webPage = `/list?sortType=USER_RATING&offset=${page}`;
                    break;
                }
                default:
                    return Promise.resolve(null);
            }
            let request = createRequestObject({
                url: `${ReadManga_DOMAIN}${webPage}`,
                method: 'GET',
                headers: this.constructHeaders({})
            });
            let data = yield this.requestManager.schedule(request, 1);
            let $ = this.cheerio.load(data.data);
            let manga = this.parser.parseSearchResults($, this.cheerio);
            let mData;
            if (!this.parser.isLastPage($)) {
                mData = { page: (page + 70) };
            }
            else {
                mData = undefined; // There are no more pages to continue on to, do not provide page metadata
            }
            return createPagedResults({
                results: manga,
                metadata: mData
            });
        });
    }
    constructHeaders(headers, refererPath) {
        if (this.userAgentRandomizer !== '') {
            headers["user-agent"] = this.userAgentRandomizer;
        }
        headers["referer"] = `${this.baseUrl}${refererPath !== null && refererPath !== void 0 ? refererPath : ''}`;
        headers["content-type"] = "application/x-www-form-urlencoded";
        return headers;
    }
    globalRequestHeaders() {
        if (this.userAgentRandomizer !== '') {
            return {
                "referer": `${this.baseUrl}/`,
                "user-agent": this.userAgentRandomizer,
                "accept": "image/jpeg,image/png,image/*;q=0.8"
            };
        }
        else {
            return {
                "referer": `${this.baseUrl}/`,
                "accept": "image/jpeg,image/png,image/*;q=0.8"
            };
        }
    }
    constructSearchRequest(searchQuery) {
        let isSearch = searchQuery != '';
        let data = {
            "q": `${searchQuery} : искать!`,
        };
        return createRequestObject({
            url: `${ReadManga_DOMAIN}/search`,
            method: 'POST',
            headers: this.constructHeaders({}),
            data: this.urlEncodeObject(data),
        });
    }
}
exports.ReadManga = ReadManga;

},{"./Parser":26,"paperback-extensions-common":4}]},{},[27])(27)
});
