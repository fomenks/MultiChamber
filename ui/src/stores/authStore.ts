import { create } from 'zustand'
import axios from 'axios'
import type { AuthState } from '@/types'

const API_URL = '/mc13/api'

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

// Add token to requests if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('multichamber_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('multichamber_token'),
  isAuthenticated: !!localStorage.getItem('multichamber_token'),
  isLoading: false,
  openChamberPort: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true })
    try {
      const response = await api.post('/auth/login', { username, password })
      const { token, user, openChamberPort } = response.data
      
      localStorage.setItem('multichamber_token', token)
      
      set({
        user,
        token,
        isAuthenticated: true,
        openChamberPort,
        isLoading: false,
      })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      localStorage.removeItem('multichamber_token')
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        openChamberPort: null,
      })
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem('multichamber_token')
    if (!token) {
      set({ isAuthenticated: false, isLoading: false })
      return
    }

    set({ isLoading: true })
    try {
      const response = await api.get('/auth/me')
      set({
        user: response.data.user,
        openChamberPort: response.data.openChamberPort,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch (error) {
      localStorage.removeItem('multichamber_token')
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    await api.post('/auth/change-password', { currentPassword, newPassword })
  },
}))
