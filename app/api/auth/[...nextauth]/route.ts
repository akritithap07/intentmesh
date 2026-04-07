import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';

const handler = NextAuth({
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
    async jwt({ token, account }) {
      // Save GitHub access token ONLY when user logs in
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },

    async session({ session, token }) {
      // Attach access token safely
      if (token?.accessToken) {
        session.accessToken = token.accessToken as string;
      }

      // Optional: attach user id for future rate limiting / tracking
      if (token.sub) {
        if (token.sub) {
  session.user = {
    ...session.user,
    id: token.sub,
  };
}
      }

      return session;
    },
  },

  // 🔐 SECURITY: use JWT strategy (default but we make it explicit)
  session: {
    strategy: 'jwt',
  },

  // 🔐 SECURITY: secret for signing tokens
  secret: process.env.NEXTAUTH_SECRET,

  // 🔐 OPTIONAL BUT GOOD: debug off in production
  debug: process.env.NODE_ENV === 'development',
});

export { handler as GET, handler as POST };