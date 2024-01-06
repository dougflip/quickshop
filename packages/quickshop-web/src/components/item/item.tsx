import { ReactNode } from "react";
import classNames from "classnames";
import classes from "./item.module.css";

type ItemState = "normal" | 'faded';

type ItemProps = {
    label: ReactNode;
    itemState?: ItemState;
    onAdd?: () => void;
    onDismiss?: () => void;
    className?: string;
}

export function Item({label, itemState = "normal", onAdd, onDismiss, className}: ItemProps) {
    return <div className={classNames(className, classes.item)}>
        <button onClick={onDismiss}>x</button>
        <span className={classNames(classes['item-label'], {
        [classes.faded]: itemState === 'faded'
    })}>{label}</span>
        <button onClick={onAdd}>✅</button>
    </div>
}
