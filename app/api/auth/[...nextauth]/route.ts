import NextAuth from 'next-auth';
import GithubProvider from 'next-auth/providers/github';

const handler = NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read:user repo', // repo scope = read/write public + private
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Save the user's GitHub access token into the JWT
      if (account) {
        token.accessToken = account.access_token ?? '';;
      }
      return token;
    },
    async session({ session, token }) {
      // Make accessToken available on the session object
      session.accessToken = token.accessToken as string;
      return session;
    },
  },
});

export { handler as GET, handler as POST };