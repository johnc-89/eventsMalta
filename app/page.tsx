import { supabase } from '@/lib/supabase'

export default async function Home() {
  // Example: Fetch events from Supabase
  // const { data: events, error } = await supabase
  //   .from('events')
  //   .select('*')
  //   .limit(10)

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Events Malta</h1>
        <p className="text-xl text-gray-600 mb-8">Discover amazing events happening around Malta</p>

        <div className="bg-white rounded-lg shadow-md p-8">
          <h2 className="text-2xl font-semibold mb-4">Welcome!</h2>
          <p className="text-gray-700 mb-4">
            This is your starting point. The Next.js + Supabase setup is ready to go.
          </p>
          <p className="text-gray-700">
            Start by creating your database schema in Supabase and connecting it to this app.
          </p>
        </div>
      </div>
    </main>
  )
}
