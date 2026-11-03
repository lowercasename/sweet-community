import styles from './Hairline.module.css'

/** 1px grey rule. The only border used for separation. */
export function Hairline() {
  return <hr className={styles.hairline} />
}
