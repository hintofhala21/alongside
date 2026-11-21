# Connect sign-in when the project owner is ready

Google and email/password use Firebase Authentication on the ongoing no-cost Spark plan. Keep billing disabled. [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) and [authentication limits](https://firebase.google.com/docs/auth/limits) describe the quotas.

1. In the adult-managed Firebase console, select or create the Alongside project on Spark. Analytics is optional and Alongside does not use it.
2. In Authentication, enable **Email/Password** and **Google**. Set the Google provider’s support email and add **hintofhala21.github.io** under authorized domains.
3. Register a Web app. Add only its public `projectId`, `authDomain`, `apiKey` and `appId` under `firebase` alongside `apiBase` in `site/config.json`. A service-account key is not needed.
4. Deploy the Worker with this configuration and publish Pages from the same revision. Test Google sign-in, verified email sign-in, password reset, sign-out, account separation on a shared browser, and the on-device path before announcing accounts.

New adult visitors sign in, enter basic profile details, and open chat. Profiles and chats stay on this browser, scoped by the Firebase user ID. Signing in on another device starts a fresh local profile. Previous unowned device profiles are preserved separately. Younger visitors enter a tab-local profile without sending an email to Firebase. The public judges’ showcase remains shareable.
