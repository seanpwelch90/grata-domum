import CryptoKit
import Foundation

/// App-private, bounded media storage. Namespace includes server, household and device session.
struct HouseMediaCache {
    let directory: URL
    var budget = 50 * 1024 * 1024

    init(directory: URL? = nil) {
        self.directory =
            directory
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("GrataDomum/media", isDirectory: true)
    }

    func read(namespace: String, path: String) -> Data? {
        let file = url(namespace, path)
        guard let data = try? Data(contentsOf: file) else { return nil }
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
        return data
    }

    func write(_ data: Data, namespace: String, path: String) {
        guard data.count <= budget else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: url(namespace, path), options: .atomic)
        let files =
            (try? FileManager.default.contentsOfDirectory(
                at: directory,
                includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey])) ?? []
        let entries = files.compactMap { file -> (URL, Int, Date)? in
            guard
                let value = try? file.resourceValues(forKeys: [
                    .fileSizeKey, .contentModificationDateKey,
                ])
            else { return nil }
            return (file, value.fileSize ?? 0, value.contentModificationDate ?? .distantPast)
        }.sorted { $0.2 < $1.2 }
        var total = entries.reduce(0) { $0 + $1.1 }
        for entry in entries where total > budget {
            try? FileManager.default.removeItem(at: entry.0)
            total -= entry.1
        }
    }

    func purge() { try? FileManager.default.removeItem(at: directory) }

    private func url(_ namespace: String, _ path: String) -> URL {
        let digest = SHA256.hash(data: Data("\(namespace)\n\(path)".utf8)).map {
            String(format: "%02x", $0)
        }.joined()
        return directory.appendingPathComponent(digest)
    }
}
