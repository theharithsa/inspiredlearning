import Brand from "../ui/Brand";
import Theme from "../ui/Theme";
import Icon from "../ui/Icon";
import { adminUrl } from "../surface";
export default function Handoff() {
  return (
    <main className="public-page">
      <header className="public-header">
        <Brand />
        <Theme />
      </header>
      <section className="panel stack">
        <span className="eyebrow">ADMINISTRATION</span>
        <h1>A dedicated place to manage learning.</h1>
        <p>
          Administrator tools now have their own sign-in and workspace. Continue
          to the administrator portal with your authorized Google account.
        </p>
        <a className="button" href={adminUrl()}>
          <Icon name="admin" />
          Open administrator portal
        </a>
        <p className="muted small">
          Your learner account stays available here. No credentials are
          transferred in this link.
        </p>
      </section>
    </main>
  );
}
