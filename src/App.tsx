function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-80 border-r border-gray-200 p-4 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Block Report</h1>
        <p className="text-gray-500 text-sm">
          Select a library or rec center on the map to view its neighborhood
          profile.
        </p>
      </aside>

      {/* Map area */}
      <main className="flex-1 bg-gray-100 flex items-center justify-center">
        <p className="text-gray-400">Map goes here</p>
      </main>
    </div>
  );
}

export default App;
