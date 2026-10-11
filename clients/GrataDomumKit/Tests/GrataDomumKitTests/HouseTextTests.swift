import XCTest

@testable import GrataDomumKit

final class HouseTextTests: XCTestCase {
    func testNamesAndAfternoon() {
        XCTAssertEqual(HouseText.joinNames(["Maya"]), "Maya")
        XCTAssertEqual(HouseText.joinNames(["Maya", "Jonah"]), "Maya and Jonah")
        XCTAssertEqual(HouseText.joinNames(["Maya", "Jonah", "Sam"]), "Maya, Jonah, and Sam")
        XCTAssertEqual(HouseText.joinNames(["A", "B", "C", "D", "E", "F"]), "A, B, C, and 3 more")
        let afternoon = ISO8601DateFormatter().date(from: "2026-09-26T18:00:00Z")!
        let zone = TimeZone(identifier: "America/New_York")!
        XCTAssertEqual(HouseText.hello(afternoon, timeZone: zone), "Good afternoon")
        XCTAssertEqual(HouseText.localDate(afternoon, timeZone: zone), "2026-09-26")
    }

    func testGuideSearchAndNotes() {
        let towels = GuideEntry(
            id: "1", title: "Extra towels", synonyms: ["bath towels"], category: "Supplies",
            location: "Hall closet, upper shelf", details: "The blue towels are for guests.",
            pinId: "p", photoURL: "")
        let trash = GuideEntry(
            id: "2", title: "Trash and recycling", synonyms: [], category: "House",
            location: "Garage bin", details: "", pinId: "", photoURL: "")
        XCTAssertEqual(
            HouseText.searchGuide([trash, towels], query: "towel").map(\.title), ["Extra towels"])
        XCTAssertEqual(HouseText.searchGuide([trash, towels], query: "bath").map(\.id), ["1"])
        XCTAssertEqual(
            HouseText.searchGuide([trash, towels], query: "").map(\.title),
            ["Extra towels", "Trash and recycling"])

        let server = HouseholdNote(
            id: "n", clientRequestId: "same-id-1", authorName: "Avery", body: "Hello",
            createdAt: "2026-09-26T18:00:00Z", seq: 1)
        let pending = PendingNote(
            clientRequestId: "same-id-1", authorName: "Avery", body: "Hello",
            createdAt: "2026-09-26T18:00:00Z", status: "pending", error: "")
        let fresh = PendingNote(
            clientRequestId: "other-id-2", authorName: "Reese", body: "Coffee",
            createdAt: "2026-09-26T19:00:00Z", status: "failed", error: "Not sent yet.")
        let merged = HouseText.mergeNotes([server], outbox: [pending, fresh])
        XCTAssertEqual(merged.map(\.note.clientRequestId), ["other-id-2", "same-id-1"])
        XCTAssertEqual(merged[0].delivery, "failed")
    }

    func testServerAddress() {
        XCTAssertEqual(
            HouseText.normalizeServer(" 192.168.1.20:8787 ")?.absoluteString,
            "http://192.168.1.20:8787")
        XCTAssertNil(HouseText.normalizeServer("not a url"))
    }
}
