export interface Event {
  id: number
  title: string
  description?: string
  date: string
  location?: string
  image_url?: string
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  email: string
  user_metadata?: {
    full_name?: string
  }
}
