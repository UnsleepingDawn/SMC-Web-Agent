"use client"

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchFromApi } from './api';

export interface BasicUser {
	name: string;
	id?: string;
}

export interface User extends BasicUser {
	id: string;
	email: string;
	avatar_url?: string | null;
}

interface AuthContextType {
	user: User | null;
	loading: boolean;
	error: string | null;
	logout: () => Promise<void>;
	refreshUser: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'auth_user';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	// Always initialize to null to match server render and avoid hydration mismatch.
	// localStorage is read in the effect below for fast optimistic state.
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Sync user state with localStorage whenever it changes
	useEffect(() => {
		if (user) {
			localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
		} else {
			localStorage.removeItem(AUTH_STORAGE_KEY);
		}
	}, [user]);

	// Check if user is logged in
	useEffect(() => {
		// Immediately restore cached user for fast UI update
		const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
		if (storedUser) {
			try {
				setUser(JSON.parse(storedUser));
			} catch {
				localStorage.removeItem(AUTH_STORAGE_KEY);
			}
		}

		async function checkAuth() {
			try {
				const response = await fetchFromApi('/api/auth/me');
				if (response.success && response.user) {
					setUser(response.user);
				} else {
					// Auth check failed, clear the user
					setUser(null);
				}
			} catch (err) {
				console.error('Auth check failed:', err);
				setError('检查登录状态失败');
				// Also clear the user on error
				setUser(null);
			} finally {
				setLoading(false);
			}
		}

		checkAuth();
	}, []);

	// Logout user
	const logout = async () => {
		try {
			setLoading(true);
			await fetchFromApi('/api/auth/logout');
			setUser(null);
		} catch (err) {
			console.error('Logout failed:', err);
			setError('退出登录失败');
		} finally {
			setLoading(false);
		}
	};

	// Re-fetch the current user from the server (e.g. after a profile update).
	const refreshUser = async () => {
		try {
			const response = await fetchFromApi('/api/auth/me');
			if (response.success && response.user) {
				setUser(response.user);
			}
		} catch (err) {
			console.error('Failed to refresh user:', err);
		}
	};

	return (
		<AuthContext.Provider value={{ user, loading, error, logout, refreshUser }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
}
