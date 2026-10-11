import Foundation

/// Explicit debug-only, read-only launch fixture. Never starts a paired session.
public enum HousePreview {
    public static var isActive: Bool {
        #if DEBUG
            return ProcessInfo.processInfo.environment["GRATA_PREVIEW_SNAPSHOT"] != nil
        #else
            return false
        #endif
    }

    #if DEBUG
        public static var snapshot: Snapshot? {
            guard let path = ProcessInfo.processInfo.environment["GRATA_PREVIEW_SNAPSHOT"],
                let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
                var snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
            else { return nil }
            if snapshot.device.surface == .tv { snapshot.actions = [] }
            snapshot.device.canPostNotes = false
            return snapshot
        }
    #endif
}
