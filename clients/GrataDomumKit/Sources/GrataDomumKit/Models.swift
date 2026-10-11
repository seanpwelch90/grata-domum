import Foundation

public enum Surface: String, Codable, Sendable {
    case ipad
    case tv
}

public struct ThemeTokens: Codable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var background: String
    public var backgroundSecondary: String
    public var text: String
    public var textSecondary: String
    public var accent: String
    public var accentText: String
    public var surface: String
    public var surfaceText: String
    public var surfaceMuted: String
    public var motion: String
    public var greetingStyle: String
}

public struct Guest: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var displayName: String
    public var initials: String
    public var avatarURL: String
}

public struct Visit: Codable, Sendable, Equatable {
    public var id: String
    public var title: String
    public var message: String
    public var startsOn: String
    public var endsOn: String
    public var guests: [Guest]
    public var coverURL: String
}

public struct WiFiInfo: Codable, Sendable, Equatable {
    public var ssid: String
    public var password: String?
    public var passwordHidden: Bool
    public var qrPayload: String
    public var qrDataURL: String
}

public struct LocationInfo: Codable, Sendable, Equatable {
    public var addressLine: String
    public var postalCode: String
}

public struct Weather: Codable, Sendable, Equatable {
    public var stale: Bool
    public var fetchedAt: String
    public var unit: String
    public var current: Current
    public var daily: [Day]

    public struct Current: Codable, Sendable, Equatable {
        public var temperature: Double
        public var code: Int
        public var label: String
    }

    public struct Day: Codable, Sendable, Equatable, Identifiable {
        public var date: String
        public var code: Int
        public var label: String
        public var high: Double
        public var low: Double
        public var id: String { date }
    }
}

public struct RoomAction: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var label: String
    public var kind: String
    public var availability: String
    public var power: String
    public var brightness: Double?
    public var message: String
}

public struct VisitEvent: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var title: String
    public var allDay: Bool
    public var eventDate: String
    public var startsAt: String?
    public var endsAt: String?
    public var location: String
    public var notes: String
    public var link: String
}

public struct MapPin: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var title: String
    public var description: String
    public var category: String
    public var roomId: String
    public var roomName: String
    public var x: Double
    public var y: Double
    public var photoURL: String
}

public struct GuideEntry: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var title: String
    public var synonyms: [String]
    public var category: String
    public var location: String
    public var details: String
    public var pinId: String
    public var photoURL: String
}

public struct HouseholdNote: Codable, Sendable, Identifiable, Equatable {
    public var id: String
    public var clientRequestId: String
    public var authorName: String
    public var body: String
    public var createdAt: String
    public var seq: Int
}

public struct HouseDevice: Codable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var surface: Surface
    public var roomId: String
    public var roomName: String
    public var canPostNotes: Bool
}

public struct HouseMap: Codable, Sendable, Equatable {
    public var imageURL: String
    public var pins: [MapPin]
}

public struct Snapshot: Codable, Sendable, Equatable {
    public var apiVersion: Int
    public var syncedAt: String
    public var timeZone: String
    public var household: Household
    public var device: HouseDevice
    public var visit: Visit?
    public var theme: ThemeTokens
    public var wifi: WiFiInfo?
    public var location: LocationInfo?
    public var weather: Weather?
    public var actions: [RoomAction]
    public var events: [VisitEvent]
    public var map: HouseMap
    public var guide: [GuideEntry]
    public var notes: [HouseholdNote]
    public var showNotesOnTV: Bool

    public struct Household: Codable, Sendable, Equatable {
        public var id: String
        public var name: String
    }
}

public struct PendingNote: Codable, Sendable, Identifiable, Equatable {
    public var clientRequestId: String
    public var authorName: String
    public var body: String
    public var createdAt: String
    public var status: String
    public var error: String
    public var id: String { clientRequestId }
}

public struct ShownNote: Identifiable, Sendable, Equatable {
    public var note: HouseholdNote
    public var delivery: String
    public var error: String
    public var id: String { note.clientRequestId }
}

public struct PairingResult: Decodable, Sendable {
    public var deviceId: String
    public var deviceToken: String
    public var apiVersion: Int
    public var surface: Surface
}

public struct HouseFailure: Error, Sendable, Equatable {
    public var message: String
    public var status: Int

    public init(message: String, status: Int) {
        self.message = message
        self.status = status
    }
}
