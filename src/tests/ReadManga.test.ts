import cheerio from 'cheerio'
import { ReadManga } from '../ReadManga/ReadManga';

const chai = require('chai');
const expect = chai.expect;

describe('ReadManga Tests - Updated for paperback-extensions-common v5', function () {

    let source: ReadManga;

    before(() => {
        source = new ReadManga(cheerio);
    });

    /**
     * The Manga ID which this unit test uses to base it's details off of.
     * Try to choose a manga which is updated frequently, so that the historical checking test can 
     * return proper results, as it is limited to searching 30 days back due to extremely long processing times otherwise.
     */

    // var mangaId = "klinok__rassekaiuchii_demonov__A5327";
    // var mangaId = "povest_o_lunnoi_princesse";
    // var mangaId = "stalnoi_alhimik__A5327";
    // var mangaId = "chelovek_benzopila_2";
    const mangaId = "elised";

    it("Retrieve Manga Details", async () => {
        const details = await source.getMangaDetails(mangaId);
        expect(details, "No results found with test-defined ID [" + mangaId + "]").to.exist;

        // Validate that the fields are filled according to new Manga interface
        console.log(details);
        expect(details.titles, "Missing Titles").to.be.not.empty;
        expect(details.image, "Missing Image").to.be.not.empty;
        expect(details.status, "Missing Status").to.exist;
        
        // Rating is optional in the new interface
        if (details.rating !== undefined) {
            expect(details.rating, "Invalid Rating").to.be.greaterThanOrEqual(0);
        }
    })

    it("Get Chapters", async () => {
        const chapters = await source.getChapters(mangaId);

        expect(chapters, "No chapters present for: [" + mangaId + "]").to.not.be.empty;
        console.log(`Found ${chapters.length} chapters`);

        const entry = chapters[0];
        expect(entry.id, "No ID present").to.not.be.empty;
        expect(entry.name, "No title available").to.not.be.empty;
        expect(entry.chapNum, "No chapter number present").to.not.be.null;
    })

    it("Get Chapter Details", async () => {
        const chapters = await source.getChapters(mangaId);
        
        if (chapters.length === 0) {
            console.warn("No chapters available for testing chapter details");
            return;
        }

        const chapterIndex = Math.min(5, chapters.length - 1);
        const chapterDetails = await source.getChapterDetails(mangaId, chapters[chapterIndex].id);
        
        console.log(`Chapter details for ${chapters[chapterIndex].name}:`, chapterDetails);
        expect(chapterDetails, "No server response").to.exist;

        expect(chapterDetails.id, "Missing ID").to.be.not.empty;
        expect(chapterDetails.mangaId, "Missing MangaID").to.be.not.empty;
        expect(chapterDetails.pages, "No pages present").to.be.not.empty;
        expect(chapterDetails.longStrip, "Missing longStrip property").to.exist;
    })

    it("Testing search", async () => {
        const testSearch = {
            title: 'Тест',
            parameters: {}
        };

        const searchResults = await source.getSearchResults(testSearch, undefined);
        
        expect(searchResults, "No response from server").to.exist;
        expect(searchResults.results, "No results array").to.be.an('array');

        if (searchResults.results.length > 0) {
            const result = searchResults.results[0];
            console.log("Search result:", result);
            
            expect(result.id, "No ID found for search query").to.be.not.empty;
            expect(result.image, "No image found for search").to.be.not.empty;
            expect(result.title, "No title").to.be.not.null;
        } else {
            console.warn("No search results found for test query");
        }
    })

    it("Testing Home-Page acquisition", async () => {
        const homePages: any[] = [];
        
        // New API uses callback-based approach for home page sections
        await source.getHomePageSections!((section) => {
            homePages.push(section);
        });
        
        expect(homePages, "No response from server").to.exist;
        expect(homePages.length, "No sections found").to.be.greaterThan(0);
        
        console.log(`Found ${homePages.length} home page sections`);
        
        // Check if first section has items
        if (homePages[0] && homePages[0].items) {
            expect(homePages[0].items, "No items present in first section").to.exist;
            console.log(`First section "${homePages[0].title}" has ${homePages[0].items.length} items`);
        }
    })

    it("Testing tags acquisition", async () => {
        // getTags is deprecated but still available in v5
        const tags = await source.getTags!();
        expect(tags, "No response from server").to.exist;
        console.log(`Found ${tags.length} tag sections`);
    })

    it("Testing view more (optional)", async () => {
        if (source.getViewMoreItems) {
            try {
                const data = await source.getViewMoreItems('0', { page: null });
                expect(data, "No server response").to.exist;
                console.log("View more items:", data);
            } catch (error) {
                console.warn("View more items not fully implemented:", error);
            }
        } else {
            console.log("getViewMoreItems not implemented");
        }
    })

    it("Testing Notifications (optional)", async () => {
        if (source.filterUpdatedManga) {
            const updates: string[] = [];
            
            await source.filterUpdatedManga((mangaUpdates) => {
                updates.push(...mangaUpdates.ids);
            }, new Date("2025-01-13"), ["chelovek_benzopila_2"]);
            
            expect(updates, "No server response").to.exist;
            console.log(`Found ${updates.length} updated manga`);
        } else {
            console.log("filterUpdatedManga not implemented");
        }
    })

    // Additional test to check source info
    it("Source Info Validation", () => {
        // ReadMangaInfo should be exported from the source file
        const ReadMangaInfo = require('../ReadManga/ReadManga').ReadMangaInfo;
        
        expect(ReadMangaInfo, "ReadMangaInfo not exported").to.exist;
        expect(ReadMangaInfo.name, "Source name missing").to.equal('ReadManga');
        expect(ReadMangaInfo.version, "Source version missing").to.be.not.empty;
        expect(ReadMangaInfo.author, "Source author missing").to.be.not.empty;
        
        console.log("Source Info:", ReadMangaInfo);
    })

})
