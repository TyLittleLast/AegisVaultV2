// Provides globalThis.indexedDB so the storage layer can be exercised in Node.
// Nothing else is shimmed: the suite deliberately runs without a DOM, which
// keeps it honest about the service layer having no rendering dependencies.
import 'fake-indexeddb/auto'
