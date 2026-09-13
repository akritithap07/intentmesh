import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: DrizzleAdapter(db),
    providers: [
        GithubProvider({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
            authorization: {
                params: {
                    scope: 'read:user repo',
                },
            },
        }),
    ],

    callbacks: {
        async jwt({ token, account, profile }) {
            // Save GitHub access token ONLY when user logs in
            if (account?.access_token) {
                token.accessToken = account.access_token;
            }

            if (profile && 'id' in profile && typeof profile.id === 'number') {
                token.githubUserId = profile.id;
            }

            return token;
        },

        async session({ session, token }) {
            // Attach access token safely
            if (token?.accessToken) {
                session.accessToken = token.accessToken as string;
            }

            // Attach user id for tracking
            if (token.sub) {
                session.user = {
                    ...session.user,
                    id: token.sub,
                };
            }

            return session;
        },
    },

    session: {
        strategy: 'jwt',
    },

    secret: process.env.AUTH_SECRET,

    debug: process.env.NODE_ENV === 'development',
});