import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Me } from "../api";

interface AuthState {
	me: Me | null;
	loading: boolean;
	refresh: () => Promise<void>;
	signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({ me: null, loading: true, refresh: async () => {}, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
	const [me, setMe] = useState<Me | null>(null);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		setLoading(true);
		try {
			setMe(await api.me());
		} catch {
			setMe(null);
		} finally {
			setLoading(false);
		}
	}, []);

	const signOut = useCallback(async () => {
		await api.logout().catch(() => {});
		setMe(null);
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return <Ctx.Provider value={{ me, loading, refresh, signOut }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const can = (me: Me | null, cap: string) => !!me?.capabilities.includes(cap);
