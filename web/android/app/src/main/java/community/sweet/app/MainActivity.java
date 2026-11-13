package community.sweet.app;

import android.os.Bundle;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.CapConfig;

/**
 * The app's activity. When a community is open, the web view starts at the community's address and treats that site
 * as its own, so links to other sites open in the browser, and the site's pages can use the app's plugins. When the
 * community cannot be loaded, the activity restarts on the app's own page, which says so. With no community open, the
 * web view shows the app's own page. SweetAppPlugin switches between them by restarting the activity.
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SweetAppPlugin.class);
        final String open = SweetAppPlugin.openCommunity(this);
        if (open != null) {
            config = new CapConfig.Builder(this).setServerUrl(open).create();
        }
        super.onCreate(savedInstanceState);
        if (open != null && bridge != null) {
            BridgeWebViewClient client = new BridgeWebViewClient(bridge) {
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request.isForMainFrame()) {
                        SweetAppPlugin.showListAfterFailure(MainActivity.this, open);
                    }
                }
            };
            bridge.setWebViewClient(client);
            bridge.getWebView().setWebViewClient(client);
        }
    }
}
