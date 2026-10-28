import { Link } from "react-router-dom";
import Icon from "./Icon";
export default function Brand() {
  return (
    <Link className="brand" to="/" aria-label="InspiredLearning home">
      <span className="brand-mark">
        <Icon name="learning" />
      </span>
      <span>InspiredLearning</span>
    </Link>
  );
}
