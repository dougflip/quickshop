import { ReactNode } from "react";
import classNames from "classnames";
import classes from "./item.module.css";

type ItemProps = {
    label: ReactNode;
    onAdd: () => void;
    onDismiss: () => void;
    className?: string;
}

export function Item({label, onAdd, onDismiss, className}: ItemProps) {
    return <div className={classNames(className, classes.item)}>
        <button onClick={onDismiss}>x</button>
        <span className={classes['item-label']}>{label}</span>
        <button onClick={onAdd}>✅</button>
    </div>
}
