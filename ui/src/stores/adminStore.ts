import { create } from 'zustand'
import axios from 'axios'
import type { AdminState, User } from '@/types'

const API_URL = '/mc13/api'

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('multichamber_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const useAdminStore = create<AdminState>((set, get) => ({
  status: null,
  isLoading: false,

  fetchStatus: async () => {
    set({ isLoading: true })
    try {
      const response = await api.get('/admin/status')
      set({ status: response.data, isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  restartInstance: async (username: string) => {
    await api.post(`/admin/restart-instance/${username}`)
    // Refresh status after restart
    await get().fetchStatus()
  },

  stopInstance: async (username: string) => {
    await api.post(`/admin/stop-instance/${username}`)
    // Refresh status after stop
    await get().fetchStatus()
  },
}))

export const useUserManagementStore = create<{
  users: User[]
  isLoading: boolean
  fetchUsers: () => Promise<void>
  createUser: (username: string, password: string, isAdmin?: boolean) => Promise<void>
  deleteUser: (username: string) => Promise<void>
}>((set, get) => ({
  users: [],
  isLoading: false,

  fetchUsers: async () => {
    set({ isLoading: true })
    try {
      const response = await api.get('/auth/users')
      set({ users: response.data.users, isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  createUser: async (username: string, password: string, isAdmin = false) => {
    await api.post('/auth/users', { username, password, isAdmin })
    await get().fetchUsers()
  },

  deleteUser: async (username: string) => {
    await api.delete(`/auth/users/${username}`)
    await get().fetchUsers()
  },
}))
