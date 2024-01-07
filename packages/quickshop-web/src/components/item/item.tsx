import { ReactNode } from "react";
import classNames from "classnames";
import classes from "./item.module.css";

type ItemState = "normal" | "faded";

type ItemProps = {
  label: ReactNode;
  itemState?: ItemState;
  rightText?: ReactNode;
  onRight?: () => void;
  leftText?: ReactNode;
  onLeft?: () => void;
  className?: string;
};

export function Item({
  label,
  itemState = "normal",
  rightText,
  onRight,
  leftText,
  onLeft,
  className,
}: ItemProps) {
  return (
    <div className={classNames(className, classes.item)}>
      {leftText && <button onClick={onLeft}>{leftText}</button>}
      <span
        className={classNames(classes["item-label"], {
          [classes.faded]: itemState === "faded",
        })}
      >
        {label}
      </span>
      {rightText && <button onClick={onRight}>{rightText}</button>}
    </div>
  );
}
