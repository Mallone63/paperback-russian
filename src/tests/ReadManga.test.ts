import cheerio from 'cheerio'
import { now } from 'moment';
import { APIWrapper, MangaUpdates, Source } from 'paperback-extensions-common';
import { ReadManga } from '../ReadManga/ReadManga';

describe('ReadManga Tests', function () {

    var wrapper: APIWrapper = new APIWrapper();
    var source: Source = new ReadManga(cheerio);
    var chai = require('chai'), expect = chai.expect, should = chai.should();
    var chaiAsPromised = require('chai-as-promised');
    chai.use(chaiAsPromised);

    /**
     * The Manga ID which this unit test uses to base it's details off of.
     * Try to choose a manga which is updated frequently, so that the historical checking test can 
     * return proper results, as it is limited to searching 30 days back due to extremely long processing times otherwise.
     */

    // var mangaId = "klinok__rassekaiuchii_demonov__A5327";
    // var mangaId = "povest_o_lunnoi_princesse";
    // var mangaId = "stalnoi_alhimik__A5327";
    // var mangaId = "chelovek_benzopila_2";
    var mangaId = "elised"
    


    it("Retrieve Manga Details", async () => {
        let details = await wrapper.getMangaDetails(source, mangaId);
        expect(details, "No results found with test-defined ID [" + mangaId + "]").to.exist;

        // Validate that the fields are filled
        let data = details;
        console.log(data);
        expect(data.id, "Missing ID").to.be.not.empty;
        expect(data.image, "Missing Image").to.be.not.empty;
        expect(data.status, "Missing Status").to.exist;
        //expect(data.desc, "Missing Description").to.be.not.empty;
        expect(data.titles, "Missing Titles").to.be.not.empty;
        expect(data.rating, "Missing Rating").to.exist;
    })

    it("Get Chapters", async () => {
        let data = await wrapper.getChapters(source, mangaId);

        expect(data, "No chapters present for: [" + mangaId + "]").to.not.be.empty;
        console.log(data);

        let entry = data[0]
        expect(entry.id, "No ID present").to.not.be.empty;
        // expect(entry.time, "No date present").to.exist
        expect(entry.name, "No title available").to.not.be.empty
        expect(entry.chapNum, "No chapter number present").to.not.be.null
    })

    it("Get Chapter Details", async () => {

        let chapters = await wrapper.getChapters(source, mangaId);
        let data = await wrapper.getChapterDetails(source, mangaId, chapters[5].id);
        console.log(data);
        expect(data, "No server response").to.exist;
        expect(data, "Empty server response").to.not.be.empty;

        expect(data.id, "Missing ID").to.be.not.empty;
        expect(data.mangaId, "Missing MangaID").to.be.not.empty;
        expect(data.pages, "No pages present").to.be.not.empty;
    })

    it("Testing search", async () => {
        let testSearch = wrapper.constructSearchRequest({
            title: 'Тест'
        });

        let search = await wrapper.searchRequest(source, testSearch, 1);
        let result = search.results[0];

        expect(result, "No response from server").to.exist;

        expect(result.id, "No ID found for search query").to.be.not.empty;
        expect(result.image, "No image found for search").to.be.not.empty;
        expect(result.title, "No title").to.be.not.null;
        expect(result.subtitleText, "No subtitle text").to.be.not.null;
    })

    it("Testing Home-Page aquisition", async () => {
        let homePages = await wrapper.getHomePageSections(source)
        expect(homePages, "No response from server").to.exist
        expect(homePages[0].items, "No items present").to.exist

        // Ensure that we can resolve each of the images for the home-page, since these images are generated and not scraped
        const promises: Promise<void>[] = []
        let axios = require('axios')
        for (let obj of homePages[0].items ?? []) {
            promises.push(axios.get(obj.image).then((imageResult: { status: any; }) => { expect(imageResult.status).to.equal(200) }))
        }
        await Promise.all(promises)
    })

    it("Testing tags aquisition", async () => {
        let tags = await wrapper.getTags(source)
        expect(tags, "No response from server").to.exist
    })

    it("Testing view more", async () => {
        let data = await wrapper.getViewMoreItems(source, '0', { page: null })
        expect(data, "No server response").to.exist;
        expect(data, "Empty server response").to.not.be.empty;
    })

    it("Testing Notifications", async () => {
        let updates = await wrapper.filterUpdatedManga(source, new Date("2024-01-13"), ["chelovek_benzopila_2"]);
        expect(updates, "No server response").to.exist;
        expect(updates, "Empty server response").to.not.be.empty;
    })

})