Ext.define('Rally.technicalservices.programVelocityChart', function() {

    var self; 

    return {
        extend: 'Rally.ui.chart.Chart',
        alias: 'widget.progresschart',

        // itemId: 'rally-chart',
        chartData: {

        },
        loadMask: false,
        // chartColors : ["#CCCCCC","#00a9e0","#009933","#CCCCCC","#00a9e0","#009933"],
        chartConfig: {
            chart: {
                type: 'column',
                zoomType: 'xy'
            },
            title: {
                text: 'Program Velocity Metrics'
            },
            subtitle: {
                text: ''
            },
            xAxis: {
                title: {
                    enabled : true,
                    text: 'Day'
                },
                startOnTick: true,
                endOnTick: true,
                min : 0
            },
            yAxis: [
                {
                    title: {
                        text: 'Value'
                    },
                    plotLines : [{
                        color: '#000000',
                        width: 1,
                        value: 0,
                        zIndex : 4,
                        label : {text:"-"}
                    }]
                }],

            plotOptions: {
                series : {
                    point : {
                        events : {
                            click : function(a) {
                            }
                        }
                    },
                    pointPadding: 0.1,
                    groupPadding: 0,
                    borderWidth: 0
                },
                column : {
                    stacking : 'normal',
                },
            }
        },

        initComponent : function() {
            this.callParent(arguments);
            this.addEvents('series_click');
        },

        constructor: function (config) {
            self = this;
            self.callParent(arguments);
            this.initConfig(config);

            if (config.title){
                self.chartConfig.title.text = config.title;
            }
            self.itemId = config.itemId

            

            self.chartData = config.chartData;

            return self;
        }
    }
});