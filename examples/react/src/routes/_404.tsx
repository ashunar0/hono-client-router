import { href } from "../react-adapter";

export default function NotFound() {
  return (
    <>
      <h1>404 Not Found</h1>
      <p>
        <a href={href("/")}>Home に戻る</a>
      </p>
    </>
  );
}
